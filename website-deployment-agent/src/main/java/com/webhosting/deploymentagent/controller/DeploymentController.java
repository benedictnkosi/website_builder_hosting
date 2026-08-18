package com.webhosting.deploymentagent.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.webhosting.deploymentagent.model.DeployRequest;
import com.webhosting.deploymentagent.model.DeployResponse;
import com.webhosting.deploymentagent.model.SiteInfoResponse;
import com.webhosting.deploymentagent.service.DeploymentService;

@RestController
@RequestMapping("/api/v1")
public class DeploymentController {

    private final DeploymentService deploymentService;

    public DeploymentController(DeploymentService deploymentService) {
        this.deploymentService = deploymentService;
    }

    @PostMapping("/deploy")
    public ResponseEntity<DeployResponse> deploy(@Validated @RequestBody DeployRequest request) {
        DeployResponse response = deploymentService.deploy(request);
        return ResponseEntity.status(HttpStatus.OK).body(response);
    }

    @GetMapping("/sites/{domain}")
    public ResponseEntity<SiteInfoResponse> getSite(@PathVariable String domain) {
        SiteInfoResponse response = deploymentService.getSiteInfo(domain);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/sites/{domain}")
    public ResponseEntity<DeployResponse> deleteSite(@PathVariable String domain) {
        deploymentService.deleteSite(domain);
        return ResponseEntity.ok(new DeployResponse(
                true,
                null,
                domain,
                "Website removed successfully"));
    }
}
