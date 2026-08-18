package com.webhosting.deploymentagent.model;

public class DeployResponse {

    private boolean success;
    private String websiteId;
    private String domain;
    private String message;

    public DeployResponse() {
    }

    public DeployResponse(boolean success, String websiteId, String domain, String message) {
        this.success = success;
        this.websiteId = websiteId;
        this.domain = domain;
        this.message = message;
    }

    public static DeployResponse success(String websiteId, String domain, String message) {
        return new DeployResponse(true, websiteId, domain, message);
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getWebsiteId() {
        return websiteId;
    }

    public void setWebsiteId(String websiteId) {
        this.websiteId = websiteId;
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
