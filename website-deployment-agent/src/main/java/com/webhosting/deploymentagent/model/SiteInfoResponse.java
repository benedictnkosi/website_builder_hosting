package com.webhosting.deploymentagent.model;

public class SiteInfoResponse {

    private String domain;
    private boolean exists;
    private String deploymentDirectory;

    public SiteInfoResponse() {
    }

    public SiteInfoResponse(String domain, boolean exists, String deploymentDirectory) {
        this.domain = domain;
        this.exists = exists;
        this.deploymentDirectory = deploymentDirectory;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public boolean isExists() {
        return exists;
    }

    public void setExists(boolean exists) {
        this.exists = exists;
    }

    public String getDeploymentDirectory() {
        return deploymentDirectory;
    }

    public void setDeploymentDirectory(String deploymentDirectory) {
        this.deploymentDirectory = deploymentDirectory;
    }
}
