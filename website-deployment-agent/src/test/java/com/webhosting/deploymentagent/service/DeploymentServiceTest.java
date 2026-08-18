package com.webhosting.deploymentagent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
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
import org.springframework.http.HttpStatus;

import com.webhosting.deploymentagent.exception.CaddyException;
import com.webhosting.deploymentagent.exception.DeploymentException;
import com.webhosting.deploymentagent.exception.InvalidFilePathException;
import com.webhosting.deploymentagent.model.DeployRequest;
import com.webhosting.deploymentagent.model.DeployResponse;
import com.webhosting.deploymentagent.model.WebsiteFile;
import com.webhosting.deploymentagent.service.CaddyService.StagedConfiguration;

@ExtendWith(MockitoExtension.class)
class DeploymentServiceTest {

    @Mock
    private FileService fileService;

    @Mock
    private CaddyService caddyService;

    private DeploymentService deploymentService;

    @BeforeEach
    void setUp() {
        deploymentService = new DeploymentService(
                new DomainValidationService(),
                fileService,
                caddyService);
    }

    @Test
    void deploysSuccessfully() throws Exception {
        DeployRequest request = validRequest();
        Path tempDir = Path.of("/tmp/deploy-1");
        Path finalDir = Path.of("/var/www/sites/example.com");
        StagedConfiguration staged = new StagedConfiguration(
                "example.com",
                Path.of("/tmp/caddy/example.com.caddy.staging"),
                Path.of("/tmp/caddy/sites-enabled/example.com.caddy"),
                "example.com.caddy");

        when(fileService.createTemporaryDeploymentDirectory()).thenReturn(tempDir);
        when(fileService.getWebsiteDirectory("example.com")).thenReturn(finalDir);
        when(caddyService.generateConfiguration("example.com", finalDir)).thenReturn("http://example.com { }");
        when(caddyService.stageConfiguration("example.com", "http://example.com { }")).thenReturn(staged);
        doNothing().when(fileService).ensureDirectoriesExist();
        doNothing().when(fileService).validateDeploymentLimits(request.getFiles());
        doNothing().when(fileService).writeFiles(tempDir, request.getFiles());
        doNothing().when(fileService).validateRequiredFiles(tempDir);
        doNothing().when(caddyService).validateConfiguration();
        doNothing().when(caddyService).finalizeConfiguration(staged);
        doNothing().when(fileService).activateDeployment(tempDir, "example.com");
        doNothing().when(caddyService).reloadCaddy();

        DeployResponse response = deploymentService.deploy(request);

        assertEquals(true, response.isSuccess());
        assertEquals("12345", response.getWebsiteId());
        assertEquals("example.com", response.getDomain());
        verify(caddyService).reloadCaddy();
    }

    @Test
    void failsWhenIndexHtmlMissing() throws Exception {
        DeployRequest request = validRequest();
        doNothing().when(fileService).ensureDirectoriesExist();
        doNothing().when(fileService).validateDeploymentLimits(request.getFiles());
        when(fileService.createTemporaryDeploymentDirectory()).thenReturn(Path.of("/tmp/deploy-1"));
        doNothing().when(fileService).writeFiles(any(), any());
        doThrow(new DeploymentException("MISSING_REQUIRED_FILE", "Required file is missing: index.html",
                HttpStatus.BAD_REQUEST))
                .when(fileService).validateRequiredFiles(any());

        DeploymentException ex = assertThrows(DeploymentException.class, () -> deploymentService.deploy(request));
        assertEquals("MISSING_REQUIRED_FILE", ex.getErrorCode());
        verify(caddyService, never()).reloadCaddy();
    }

    @Test
    void failsWhenStylesCssMissing() throws Exception {
        DeployRequest request = validRequest();
        doNothing().when(fileService).ensureDirectoriesExist();
        doNothing().when(fileService).validateDeploymentLimits(request.getFiles());
        when(fileService.createTemporaryDeploymentDirectory()).thenReturn(Path.of("/tmp/deploy-1"));
        doNothing().when(fileService).writeFiles(any(), any());
        doThrow(new DeploymentException("MISSING_REQUIRED_FILE", "Required file is missing: styles.css",
                HttpStatus.BAD_REQUEST))
                .when(fileService).validateRequiredFiles(any());

        DeploymentException ex = assertThrows(DeploymentException.class, () -> deploymentService.deploy(request));
        assertEquals("MISSING_REQUIRED_FILE", ex.getErrorCode());
    }

    @Test
    void failsWhenScriptJsMissing() throws Exception {
        DeployRequest request = validRequest();
        doNothing().when(fileService).ensureDirectoriesExist();
        doNothing().when(fileService).validateDeploymentLimits(request.getFiles());
        when(fileService.createTemporaryDeploymentDirectory()).thenReturn(Path.of("/tmp/deploy-1"));
        doNothing().when(fileService).writeFiles(any(), any());
        doThrow(new DeploymentException("MISSING_REQUIRED_FILE", "Required file is missing: script.js",
                HttpStatus.BAD_REQUEST))
                .when(fileService).validateRequiredFiles(any());

        DeploymentException ex = assertThrows(DeploymentException.class, () -> deploymentService.deploy(request));
        assertEquals("MISSING_REQUIRED_FILE", ex.getErrorCode());
    }

    @Test
    void failsOnInvalidFilePath() throws Exception {
        DeployRequest request = validRequest();
        doNothing().when(fileService).ensureDirectoriesExist();
        doThrow(new InvalidFilePathException("Path traversal is not allowed"))
                .when(fileService).validateDeploymentLimits(request.getFiles());

        assertThrows(InvalidFilePathException.class, () -> deploymentService.deploy(request));
        verify(caddyService, never()).reloadCaddy();
    }

    @Test
    void failsOnCaddyValidationFailure() throws Exception {
        DeployRequest request = validRequest();
        Path tempDir = Path.of("/tmp/deploy-1");
        Path finalDir = Path.of("/var/www/sites/example.com");
        StagedConfiguration staged = new StagedConfiguration(
                "example.com",
                Path.of("/tmp/caddy/example.com.caddy.staging"),
                Path.of("/tmp/caddy/sites-enabled/example.com.caddy"),
                "example.com.caddy");

        when(fileService.createTemporaryDeploymentDirectory()).thenReturn(tempDir);
        when(fileService.getWebsiteDirectory("example.com")).thenReturn(finalDir);
        when(caddyService.generateConfiguration("example.com", finalDir)).thenReturn("http://example.com { }");
        when(caddyService.stageConfiguration("example.com", "http://example.com { }")).thenReturn(staged);
        doNothing().when(fileService).ensureDirectoriesExist();
        doNothing().when(fileService).validateDeploymentLimits(request.getFiles());
        doNothing().when(fileService).writeFiles(tempDir, request.getFiles());
        doNothing().when(fileService).validateRequiredFiles(tempDir);
        doThrow(new CaddyException("CADDY_VALIDATION_FAILED", "invalid config", HttpStatus.BAD_GATEWAY))
                .when(caddyService).validateConfiguration();

        CaddyException ex = assertThrows(CaddyException.class, () -> deploymentService.deploy(request));
        assertEquals("CADDY_VALIDATION_FAILED", ex.getErrorCode());
        verify(fileService).cleanupQuietly(tempDir);
        verify(caddyService).rollbackStagedConfiguration(staged);
        verify(caddyService, never()).reloadCaddy();
    }

    @Test
    void failsOnCaddyReloadFailure() throws Exception {
        DeployRequest request = validRequest();
        Path tempDir = Path.of("/tmp/deploy-1");
        Path finalDir = Path.of("/var/www/sites/example.com");
        StagedConfiguration staged = new StagedConfiguration(
                "example.com",
                Path.of("/tmp/caddy/example.com.caddy.staging"),
                Path.of("/tmp/caddy/sites-enabled/example.com.caddy"),
                "example.com.caddy");

        when(fileService.createTemporaryDeploymentDirectory()).thenReturn(tempDir);
        when(fileService.getWebsiteDirectory("example.com")).thenReturn(finalDir);
        when(caddyService.generateConfiguration("example.com", finalDir)).thenReturn("http://example.com { }");
        when(caddyService.stageConfiguration("example.com", "http://example.com { }")).thenReturn(staged);
        doNothing().when(fileService).ensureDirectoriesExist();
        doNothing().when(fileService).validateDeploymentLimits(request.getFiles());
        doNothing().when(fileService).writeFiles(tempDir, request.getFiles());
        doNothing().when(fileService).validateRequiredFiles(tempDir);
        doNothing().when(caddyService).validateConfiguration();
        doNothing().when(caddyService).finalizeConfiguration(staged);
        doNothing().when(fileService).activateDeployment(tempDir, "example.com");
        doThrow(new CaddyException("CADDY_RELOAD_FAILED", "reload failed", HttpStatus.BAD_GATEWAY))
                .when(caddyService).reloadCaddy();

        CaddyException ex = assertThrows(CaddyException.class, () -> deploymentService.deploy(request));
        assertEquals("CADDY_RELOAD_FAILED", ex.getErrorCode());
    }

    private DeployRequest validRequest() {
        DeployRequest request = new DeployRequest();
        request.setWebsiteId("12345");
        request.setDomain("example.com");
        request.setFiles(List.of(
                file("index.html", "<!DOCTYPE html><html></html>"),
                file("styles.css", "body { margin: 0; }"),
                file("script.js", "console.log('ok');")));
        return request;
    }

    private WebsiteFile file(String path, String content) {
        WebsiteFile websiteFile = new WebsiteFile();
        websiteFile.setPath(path);
        websiteFile.setContent(content);
        return websiteFile;
    }
}
