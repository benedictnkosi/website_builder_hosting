package com.webhosting.deploymentagent.service;

import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.webhosting.deploymentagent.service.CaddyService.StagedConfiguration;

@Service
@ConditionalOnProperty(prefix = "deployment", name = "enable-https", havingValue = "true")
public class HttpsActivationService {

    private static final Logger log = LoggerFactory.getLogger(HttpsActivationService.class);

    private final CaddyService caddyService;
    private final FileService fileService;
    private final DnsResolutionService dnsResolutionService;

    public HttpsActivationService(
            CaddyService caddyService,
            FileService fileService,
            DnsResolutionService dnsResolutionService) {
        this.caddyService = caddyService;
        this.fileService = fileService;
        this.dnsResolutionService = dnsResolutionService;
    }

    @Scheduled(fixedDelayString = "${deployment.https-retry-ms:30000}")
    public void activateHttpsWhenDnsIsReady() {
        try {
            for (String domain : caddyService.listHttpOnlyDomains()) {
                if (!dnsResolutionService.isReadyForHttps(domain)) {
                    continue;
                }
                promoteToHttps(domain);
                return;
            }
        } catch (Exception ex) {
            log.warn("HTTPS activation scan failed: {}", ex.getMessage());
        }
    }

    private void promoteToHttps(String domain) {
        StagedConfiguration staged = null;
        try {
            Path websiteRoot = fileService.getWebsiteDirectory(domain);
            String configuration = caddyService.generateConfiguration(domain, websiteRoot, true);
            staged = caddyService.stageConfiguration(domain, configuration);
            caddyService.validateConfiguration();
            caddyService.finalizeConfiguration(staged);
            staged = null;
            caddyService.reloadCaddy();
            log.info("Enabled HTTPS for {} after public DNS became ready", domain);
        } catch (Exception ex) {
            log.warn("Failed to enable HTTPS for {}: {}", domain, ex.getMessage());
            caddyService.rollbackStagedConfiguration(staged);
        }
    }
}
