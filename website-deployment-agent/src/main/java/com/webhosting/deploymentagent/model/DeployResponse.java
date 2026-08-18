package com.webhosting.deploymentagent.model;

public class DeployResponse {

    private boolean success;
    private String websiteId;
    private String domain;
    private String message;
    private boolean httpsReady;

    public DeployResponse() {
    }

    public DeployResponse(boolean success, String websiteId, String domain, String message) {
        this(success, websiteId, domain, message, false);
    }

    public DeployResponse(boolean success, String websiteId, String domain, String message, boolean httpsReady) {
        this.success = success;
        this.websiteId = websiteId;
        this.domain = domain;
        this.message = message;
        this.httpsReady = httpsReady;
    }

    public static DeployResponse success(String websiteId, String domain, String message) {
        return success(websiteId, domain, message, false);
    }

    public static DeployResponse success(String websiteId, String domain, String message, boolean httpsReady) {
        return new DeployResponse(true, websiteId, domain, message, httpsReady);
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

    public boolean isHttpsReady() {
        return httpsReady;
    }

    public void setHttpsReady(boolean httpsReady) {
        this.httpsReady = httpsReady;
    }
}
