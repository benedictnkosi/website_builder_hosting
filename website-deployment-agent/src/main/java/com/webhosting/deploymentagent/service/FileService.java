package com.webhosting.deploymentagent.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.webhosting.deploymentagent.config.DeploymentProperties;
import com.webhosting.deploymentagent.exception.DeploymentException;
import com.webhosting.deploymentagent.exception.InvalidFilePathException;
import com.webhosting.deploymentagent.model.WebsiteFile;
import com.webhosting.deploymentagent.util.FilePathValidator;

@Service
public class FileService {

    private static final Logger log = LoggerFactory.getLogger(FileService.class);

    private final DeploymentProperties deploymentProperties;

    public FileService(DeploymentProperties deploymentProperties) {
        this.deploymentProperties = deploymentProperties;
    }

    public Path getWebRoot() {
        return Path.of(deploymentProperties.getWebRoot());
    }

    public Path getWebsiteDirectory(String normalizedDomain) {
        return getWebRoot().resolve(normalizedDomain).normalize();
    }

    public Path createTemporaryDeploymentDirectory() throws IOException {
        Path deploymentsRoot = getWebRoot().resolve(".deployments");
        Files.createDirectories(deploymentsRoot);
        Path tempDir = deploymentsRoot.resolve(UUID.randomUUID().toString());
        Files.createDirectories(tempDir);
        return tempDir;
    }

    public void validateDeploymentLimits(List<WebsiteFile> files) {
        if (files.size() > deploymentProperties.getMaxFiles()) {
            throw new DeploymentException(
                    "DEPLOYMENT_TOO_LARGE",
                    "Deployment exceeds maximum number of files (" + deploymentProperties.getMaxFiles() + ")",
                    HttpStatus.PAYLOAD_TOO_LARGE);
        }

        long totalSize = 0;
        Set<String> seenPaths = new HashSet<>();

        for (WebsiteFile file : files) {
            FilePathValidator.validateRelativePath(file.getPath());

            String normalizedPath = normalizePath(file.getPath());
            if (!seenPaths.add(normalizedPath)) {
                throw new InvalidFilePathException("Duplicate file path: " + file.getPath());
            }

            long fileSize = decodedFileSize(file);
            if (fileSize > deploymentProperties.getMaxFileSizeBytes()) {
                throw new DeploymentException(
                        "FILE_TOO_LARGE",
                        "File exceeds maximum size: " + file.getPath(),
                        HttpStatus.PAYLOAD_TOO_LARGE);
            }
            totalSize += fileSize;
        }

        if (totalSize > deploymentProperties.getMaxTotalSizeBytes()) {
            throw new DeploymentException(
                    "DEPLOYMENT_TOO_LARGE",
                    "Deployment exceeds maximum total size",
                    HttpStatus.PAYLOAD_TOO_LARGE);
        }
    }

    public void writeFiles(Path websiteRoot, List<WebsiteFile> files) throws IOException {
        for (WebsiteFile file : files) {
            Path target = FilePathValidator.resolveSafePath(websiteRoot, file.getPath());
            Files.createDirectories(target.getParent());
            if (file.isBase64Encoded()) {
                Files.write(target, Base64.getDecoder().decode(file.getContent()));
            } else {
                Files.writeString(target, file.getContent(), StandardCharsets.UTF_8);
            }
        }
    }

    public void validateRequiredFiles(Path websiteRoot) {
        for (String requiredFile : deploymentProperties.getRequiredFiles()) {
            Path requiredPath = FilePathValidator.resolveSafePath(websiteRoot, requiredFile);
            if (!Files.exists(requiredPath) || !Files.isRegularFile(requiredPath)) {
                throw new DeploymentException(
                        "MISSING_REQUIRED_FILE",
                        "Required file is missing: " + requiredFile,
                        HttpStatus.BAD_REQUEST);
            }
        }
    }

    public void activateDeployment(Path tempDir, String normalizedDomain) throws IOException {
        Path finalDir = getWebsiteDirectory(normalizedDomain);
        Files.createDirectories(finalDir.getParent());

        if (Files.exists(finalDir)) {
            deleteRecursively(finalDir);
        }

        Files.move(tempDir, finalDir);
        log.info("Activated deployment for domain {} at {}", normalizedDomain, finalDir);
    }

    public boolean websiteExists(String normalizedDomain) {
        Path websiteDir = getWebsiteDirectory(normalizedDomain);
        return Files.exists(websiteDir) && Files.isDirectory(websiteDir);
    }

    public void deleteWebsite(String normalizedDomain) throws IOException {
        Path websiteDir = getWebsiteDirectory(normalizedDomain);
        if (Files.exists(websiteDir)) {
            deleteRecursively(websiteDir);
            log.info("Deleted website directory for domain {}", normalizedDomain);
        }
    }

    public void cleanupQuietly(Path path) {
        if (path == null || !Files.exists(path)) {
            return;
        }
        try {
            deleteRecursively(path);
        } catch (IOException ex) {
            log.warn("Failed to clean up path {}: {}", path, ex.getMessage());
        }
    }

    public void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }

        try (Stream<Path> walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ex) {
                    throw new DeploymentException(
                            "DEPLOYMENT_FAILED",
                            "Failed to delete path: " + path,
                            HttpStatus.INTERNAL_SERVER_ERROR,
                            ex);
                }
            });
        }
    }

    public void ensureDirectoriesExist() throws IOException {
        Files.createDirectories(getWebRoot());
        Files.createDirectories(getWebRoot().resolve(".deployments"));
    }

    private String normalizePath(String filePath) {
        return filePath.replace('\\', '/').trim();
    }

    private long decodedFileSize(WebsiteFile file) {
        if (file.isBase64Encoded()) {
            try {
                return Base64.getDecoder().decode(file.getContent()).length;
            } catch (IllegalArgumentException ex) {
                throw new DeploymentException(
                        "DEPLOYMENT_FAILED",
                        "File is not valid base64: " + file.getPath(),
                        HttpStatus.BAD_REQUEST);
            }
        }

        return file.getContent().getBytes(StandardCharsets.UTF_8).length;
    }
}
