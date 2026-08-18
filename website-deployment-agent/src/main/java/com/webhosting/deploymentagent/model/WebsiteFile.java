package com.webhosting.deploymentagent.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class WebsiteFile {

    @NotBlank
    @Size(max = 512)
    private String path;

    @NotBlank
    private String content;

    private String encoding;

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getEncoding() {
        return encoding;
    }

    public void setEncoding(String encoding) {
        this.encoding = encoding;
    }

    public boolean isBase64Encoded() {
        return encoding != null && encoding.equalsIgnoreCase("base64");
    }
}
