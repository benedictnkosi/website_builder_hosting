package com.webhosting.deploymentagent.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.webhosting.deploymentagent.config.DeploymentProperties;
import com.webhosting.deploymentagent.exception.CaddyException;
import com.webhosting.deploymentagent.util.ProcessExecutor;
import com.webhosting.deploymentagent.util.ProcessExecutor.ProcessResult;

@Service
public class CaddyService {

    private static final Logger log = LoggerFactory.getLogger(CaddyService.class);

    private final DeploymentProperties deploymentProperties;
    private final ProcessExecutor processExecutor;
    private final DomainValidationService domainValidationService;

    public CaddyService(
            DeploymentProperties deploymentProperties,
            ProcessExecutor processExecutor,
            DomainValidationService domainValidationService) {
        this.deploymentProperties = deploymentProperties;
        this.processExecutor = processExecutor;
        this.domainValidationService = domainValidationService;
    }

    public String generateConfiguration(String normalizedDomain, Path websiteRoot) {
        String rootPath = websiteRoot.toAbsolutePath().normalize().toString().replace('\\', '/');
        String hosts = deploymentProperties.isEnableHttps()
                ? "%s, www.%s".formatted(normalizedDomain, normalizedDomain)
                : "http://%s, http://www.%s".formatted(normalizedDomain, normalizedDomain);

        return """
                %s {
                \troot * %s
                \tencode gzip
                \tfile_server
                \ttry_files {path} {path}/ =404
                }
                """.formatted(hosts, rootPath);
    }

    public void ensureLayout() throws IOException {
        Path available = sitesAvailablePath();
        Path enabled = sitesEnabledPath();
        Path caddyfile = caddyfilePath();

        Files.createDirectories(available);
        Files.createDirectories(enabled);
        Files.createDirectories(caddyfile.getParent());

        String importLine = "import "
                + enabled.toAbsolutePath().normalize().toString().replace('\\', '/')
                + "/*";

        String mainConfig;
        if (deploymentProperties.isEnableHttps()) {
            String email = deploymentProperties.getAcmeEmail() == null
                    ? ""
                    : deploymentProperties.getAcmeEmail().trim();
            if (!email.isEmpty()) {
                mainConfig = """
                        {
                        \temail %s
                        }

                        %s
                        """.formatted(email, importLine);
            } else {
                mainConfig = importLine + System.lineSeparator();
            }
        } else {
            mainConfig = """
                    {
                    \tauto_https off
                    \thttp_port 80
                    }

                    %s
                    """.formatted(importLine);
        }

        Files.writeString(caddyfile, mainConfig, StandardCharsets.UTF_8);
    }

    public StagedConfiguration stageConfiguration(String normalizedDomain, String configuration) throws IOException {
        ensureLayout();

        String filename = domainValidationService.toConfigFilename(normalizedDomain);
        Path stagingPath = sitesAvailablePath().resolve(filename + ".staging");
        Path enabledPath = sitesEnabledPath().resolve(filename);

        Files.writeString(stagingPath, configuration, StandardCharsets.UTF_8);

        removeSymlinkIfExists(enabledPath);
        Files.createSymbolicLink(enabledPath, stagingPath.toAbsolutePath());

        return new StagedConfiguration(normalizedDomain, stagingPath, enabledPath, filename);
    }

    public void validateConfiguration() {
        try {
            ProcessResult result = runCaddy(List.of(
                    "validate",
                    "--config",
                    caddyfilePath().toAbsolutePath().toString()));

            if (result.isSuccess()) {
                log.info("Caddy configuration validation succeeded");
                return;
            }

            log.error("Caddy configuration validation failed: {}", result.combinedOutput());
            throw new CaddyException(
                    "CADDY_VALIDATION_FAILED",
                    "Caddy configuration validation failed: " + result.combinedOutput(),
                    HttpStatus.BAD_GATEWAY);
        } catch (CaddyException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Failed to run Caddy validation", ex);
            throw new CaddyException(
                    "CADDY_VALIDATION_FAILED",
                    "Failed to run Caddy validation",
                    HttpStatus.BAD_GATEWAY,
                    ex);
        }
    }

    public void finalizeConfiguration(StagedConfiguration staged) throws IOException {
        Path finalAvailablePath = sitesAvailablePath().resolve(staged.filename());
        Files.move(staged.stagingPath(), finalAvailablePath,
                java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                java.nio.file.StandardCopyOption.ATOMIC_MOVE);

        removeSymlinkIfExists(staged.enabledPath());
        Files.createSymbolicLink(staged.enabledPath(), finalAvailablePath.toAbsolutePath());
        log.info("Activated Caddy configuration for domain {}", staged.normalizedDomain());
    }

    public void rollbackStagedConfiguration(StagedConfiguration staged) {
        if (staged == null) {
            return;
        }
        try {
            removeSymlinkIfExists(staged.enabledPath());
            Files.deleteIfExists(staged.stagingPath());
        } catch (IOException ex) {
            log.warn("Failed to roll back staged Caddy config for {}: {}",
                    staged.normalizedDomain(), ex.getMessage());
        }
    }

    public void reloadCaddy() {
        try {
            ProcessResult result = runCaddy(List.of(
                    "reload",
                    "--config",
                    caddyfilePath().toAbsolutePath().toString()));

            if (result.isSuccess()) {
                log.info("Caddy reload succeeded");
                return;
            }

            if (isCaddyNotRunning(result)) {
                log.error("Caddy is not running; reload could not reach the admin API");
                throw new CaddyException(
                        "CADDY_RELOAD_FAILED",
                        "Caddy is not running. Start it first, then deploy again: sudo caddy run --config "
                                + caddyfilePath().toAbsolutePath(),
                        HttpStatus.BAD_GATEWAY);
            }

            log.error("Caddy reload failed: {}", result.combinedOutput());
            throw new CaddyException(
                    "CADDY_RELOAD_FAILED",
                    "Caddy reload failed: " + result.combinedOutput(),
                    HttpStatus.BAD_GATEWAY);
        } catch (CaddyException ex) {
            throw ex;
        } catch (Exception ex) {
            log.error("Failed to reload Caddy", ex);
            throw new CaddyException(
                    "CADDY_RELOAD_FAILED",
                    "Failed to reload Caddy",
                    HttpStatus.BAD_GATEWAY,
                    ex);
        }
    }

    private ProcessResult runCaddy(List<String> arguments) throws IOException, InterruptedException {
        List<String> command = new java.util.ArrayList<>();
        command.add(deploymentProperties.getCaddyCommand());
        command.addAll(arguments);
        return processExecutor.execute(command);
    }

    private boolean isCaddyNotRunning(ProcessResult result) {
        String output = result.combinedOutput().toLowerCase();
        return output.contains("connection refused")
                || output.contains("dial tcp")
                || output.contains("connect: connection refused");
    }

    public void removeConfiguration(String normalizedDomain) throws IOException {
        String filename = domainValidationService.toConfigFilename(normalizedDomain);
        Path availablePath = sitesAvailablePath().resolve(filename);
        Path enabledPath = sitesEnabledPath().resolve(filename);
        Path stagingPath = sitesAvailablePath().resolve(filename + ".staging");

        removeSymlinkIfExists(enabledPath);
        Files.deleteIfExists(availablePath);
        Files.deleteIfExists(stagingPath);
        log.info("Removed Caddy configuration for domain {}", normalizedDomain);
    }

    private Path caddyfilePath() {
        return Path.of(deploymentProperties.getCaddyConfig());
    }

    private Path sitesAvailablePath() {
        return Path.of(deploymentProperties.getCaddySitesAvailable());
    }

    private Path sitesEnabledPath() {
        return Path.of(deploymentProperties.getCaddySitesEnabled());
    }

    private void removeSymlinkIfExists(Path symlinkPath) throws IOException {
        if (Files.exists(symlinkPath) || Files.isSymbolicLink(symlinkPath)) {
            Files.deleteIfExists(symlinkPath);
        }
    }

    public record StagedConfiguration(
            String normalizedDomain,
            Path stagingPath,
            Path enabledPath,
            String filename) {
    }
}
