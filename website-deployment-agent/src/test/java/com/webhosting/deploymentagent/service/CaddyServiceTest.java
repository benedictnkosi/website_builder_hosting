package com.webhosting.deploymentagent.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.webhosting.deploymentagent.config.DeploymentProperties;
import com.webhosting.deploymentagent.util.ProcessExecutor;

class CaddyServiceTest {

    private CaddyService caddyService;

    @BeforeEach
    void setUp() {
        DeploymentProperties properties = new DeploymentProperties();
        properties.setCaddyConfig("/tmp/website-agent/caddy/Caddyfile");
        properties.setCaddySitesAvailable("/tmp/website-agent/caddy/sites-available");
        properties.setCaddySitesEnabled("/tmp/website-agent/caddy/sites-enabled");
        properties.setCaddyCommand("caddy");

        caddyService = new CaddyService(properties, new ProcessExecutor(), new DomainValidationService());
    }

    @Test
    void generatedConfigurationContainsRequiredDirectives() {
        String config = caddyService.generateConfiguration(
                "thandoplumbing.co.za",
                Path.of("/var/www/sites/thandoplumbing.co.za"));

        assertTrue(config.contains("http://thandoplumbing.co.za, http://www.thandoplumbing.co.za"));
        assertTrue(config.contains("root * /var/www/sites/thandoplumbing.co.za"));
        assertTrue(config.contains("file_server"));
        assertTrue(config.contains("try_files {path} {path}/ =404"));
    }

    @Test
    void generatedConfigurationDoesNotAllowDirectiveInjection() {
        String config = caddyService.generateConfiguration(
                "example.com",
                Path.of("/var/www/sites/example.com"));

        assertFalse(config.contains("reverse_proxy"));
        assertFalse(config.contains("example.com\n    evil"));
        assertTrue(config.contains("http://example.com, http://www.example.com"));
    }
}
