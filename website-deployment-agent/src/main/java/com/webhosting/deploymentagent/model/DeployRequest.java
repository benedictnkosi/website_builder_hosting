package com.webhosting.deploymentagent.model;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

public class DeployRequest {

    @NotBlank
    @Size(max = 128)
    private String websiteId;

    @NotBlank
    @Size(max = 253)
    private String domain;

    @NotEmpty
    @Valid
    private List<WebsiteFile> files;

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

    public List<WebsiteFile> getFiles() {
        return files;
    }

    public void setFiles(List<WebsiteFile> files) {
        this.files = files;
    }
}
