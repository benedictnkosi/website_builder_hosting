package com.webhosting.deploymentagent.service;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.webhosting.deploymentagent.service.CaddyService.StagedConfiguration;

@ExtendWith(MockitoExtension.class)
class HttpsActivationServiceTest {

    @Mock
    private CaddyService caddyService;

    @Mock
    private FileService fileService;

    @Mock
    private DnsResolutionService dnsResolutionService;

    private HttpsActivationService httpsActivationService;

    @BeforeEach
    void setUp() {
        httpsActivationService = new HttpsActivationService(
                caddyService, fileService, dnsResolutionService);
    }

    @Test
    void promotesHttpSiteOnceDnsIsReady() throws Exception {
        Path websiteRoot = Path.of("/var/www/sites/example.com");
        StagedConfiguration staged = new StagedConfiguration(
                "example.com",
                Path.of("/tmp/caddy/example.com.caddy.staging"),
                Path.of("/tmp/caddy/sites-enabled/example.com.caddy"),
                "example.com.caddy");

        when(caddyService.listHttpOnlyDomains()).thenReturn(List.of("example.com"));
        when(dnsResolutionService.isReadyForHttps("example.com")).thenReturn(true);
        when(fileService.getWebsiteDirectory("example.com")).thenReturn(websiteRoot);
        when(caddyService.generateConfiguration("example.com", websiteRoot, true)).thenReturn("example.com { }");
        when(caddyService.stageConfiguration("example.com", "example.com { }")).thenReturn(staged);

        httpsActivationService.activateHttpsWhenDnsIsReady();

        verify(caddyService).finalizeConfiguration(staged);
        verify(caddyService).reloadCaddy();
    }

    @Test
    void skipsSitesUntilDnsIsReady() throws Exception {
        when(caddyService.listHttpOnlyDomains()).thenReturn(List.of("example.com"));
        when(dnsResolutionService.isReadyForHttps("example.com")).thenReturn(false);

        httpsActivationService.activateHttpsWhenDnsIsReady();

        verify(caddyService, never()).reloadCaddy();
        verify(caddyService, never()).generateConfiguration(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyBoolean());
    }
}
