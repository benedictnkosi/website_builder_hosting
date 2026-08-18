package com.webhosting.deploymentagent.service;

import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.webhosting.deploymentagent.exception.DeploymentException;
import com.webhosting.deploymentagent.model.DeployRequest;
import com.webhosting.deploymentagent.model.DeployResponse;
import com.webhosting.deploymentagent.model.SiteInfoResponse;
import com.webhosting.deploymentagent.service.CaddyService.StagedConfiguration;

@Service
public class DeploymentService {

    private static final Logger log = LoggerFactory.getLogger(DeploymentService.class);

    private final DomainValidationService domainValidationService;
    private final FileService fileService;
    private final CaddyService caddyService;

    public DeploymentService(
            DomainValidationService domainValidationService,
            FileService fileService,
            CaddyService caddyService) {
        this.domainValidationService = domainValidationService;
        this.fileService = fileService;
        this.caddyService = caddyService;
    }

    public DeployResponse deploy(DeployRequest request) {
        String normalizedDomain = domainValidationService.validateAndNormalize(request.getDomain());
        Path tempDeploymentDir = null;
        StagedConfiguration stagedConfig = null;

        log.info("Deployment started for websiteId={}, domain={}, fileCount={}",
                request.getWebsiteId(), normalizedDomain, request.getFiles().size());

        try {
            fileService.ensureDirectoriesExist();
            fileService.validateDeploymentLimits(request.getFiles());

            tempDeploymentDir = fileService.createTemporaryDeploymentDirectory();
            fileService.writeFiles(tempDeploymentDir, request.getFiles());
            fileService.validateRequiredFiles(tempDeploymentDir);

            Path finalWebsiteDir = fileService.getWebsiteDirectory(normalizedDomain);
            String caddyConfig = caddyService.generateConfiguration(normalizedDomain, finalWebsiteDir);
            stagedConfig = caddyService.stageConfiguration(normalizedDomain, caddyConfig);

            caddyService.validateConfiguration();
            caddyService.finalizeConfiguration(stagedConfig);
            stagedConfig = null;

            fileService.activateDeployment(tempDeploymentDir, normalizedDomain);
            tempDeploymentDir = null;

            caddyService.reloadCaddy();

            log.info("Deployment succeeded for websiteId={}, domain={}",
                    request.getWebsiteId(), normalizedDomain);

            return DeployResponse.success(
                    request.getWebsiteId(),
                    normalizedDomain,
                    "Website deployed successfully");
        } catch (DeploymentException ex) {
            log.error("Deployment failed for websiteId={}, domain={}: {}",
                    request.getWebsiteId(), normalizedDomain, ex.getMessage());
            cleanup(tempDeploymentDir, stagedConfig);
            throw ex;
        } catch (Exception ex) {
            log.error("Deployment failed for websiteId={}, domain={}",
                    request.getWebsiteId(), normalizedDomain, ex);
            cleanup(tempDeploymentDir, stagedConfig);
            throw new DeploymentException(
                    "DEPLOYMENT_FAILED",
                    "Deployment failed: " + ex.getMessage(),
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    ex);
        }
    }

    public SiteInfoResponse getSiteInfo(String domain) {
        String normalizedDomain = domainValidationService.validateAndNormalize(domain);
        Path websiteDir = fileService.getWebsiteDirectory(normalizedDomain);
        boolean exists = fileService.websiteExists(normalizedDomain);

        return new SiteInfoResponse(
                normalizedDomain,
                exists,
                websiteDir.toAbsolutePath().normalize().toString());
    }

    public void deleteSite(String domain) {
        String normalizedDomain = domainValidationService.validateAndNormalize(domain);

        log.info("Deleting site for domain={}", normalizedDomain);

        try {
            fileService.ensureDirectoriesExist();
            fileService.deleteWebsite(normalizedDomain);
            caddyService.removeConfiguration(normalizedDomain);
            caddyService.validateConfiguration();
            caddyService.reloadCaddy();
            log.info("Site deleted for domain={}", normalizedDomain);
        } catch (DeploymentException ex) {
            log.error("Site deletion failed for domain={}: {}", normalizedDomain, ex.getMessage());
            throw ex;
        } catch (Exception ex) {
            log.error("Site deletion failed for domain={}", normalizedDomain, ex);
            throw new DeploymentException(
                    "DEPLOYMENT_FAILED",
                    "Failed to delete site: " + ex.getMessage(),
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    ex);
        }
    }

    private void cleanup(Path tempDeploymentDir, StagedConfiguration stagedConfig) {
        fileService.cleanupQuietly(tempDeploymentDir);
        caddyService.rollbackStagedConfiguration(stagedConfig);
    }
}
