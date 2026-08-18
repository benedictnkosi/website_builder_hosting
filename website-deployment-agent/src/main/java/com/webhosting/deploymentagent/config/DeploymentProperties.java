package com.webhosting.deploymentagent.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "deployment")
public class DeploymentProperties {

    private String webRoot = "/tmp/website-agent/sites";
    private String caddyConfig = "/tmp/website-agent/caddy/Caddyfile";
    private String caddySitesAvailable = "/tmp/website-agent/caddy/sites-available";
    private String caddySitesEnabled = "/tmp/website-agent/caddy/sites-enabled";
    private String caddyCommand = "caddy";
    private boolean enableHttps = false;
    private String acmeEmail = "";
    private int maxFiles = 100;
    private long maxFileSizeBytes = 2 * 1024 * 1024;
    private long maxTotalSizeBytes = 10 * 1024 * 1024;
    private List<String> requiredFiles = new ArrayList<>(List.of("index.html", "styles.css", "script.js"));

    public String getWebRoot() {
        return webRoot;
    }

    public void setWebRoot(String webRoot) {
        this.webRoot = webRoot;
    }

    public String getCaddyConfig() {
        return caddyConfig;
    }

    public void setCaddyConfig(String caddyConfig) {
        this.caddyConfig = caddyConfig;
    }

    public String getCaddySitesAvailable() {
        return caddySitesAvailable;
    }

    public void setCaddySitesAvailable(String caddySitesAvailable) {
        this.caddySitesAvailable = caddySitesAvailable;
    }

    public String getCaddySitesEnabled() {
        return caddySitesEnabled;
    }

    public void setCaddySitesEnabled(String caddySitesEnabled) {
        this.caddySitesEnabled = caddySitesEnabled;
    }

    public String getCaddyCommand() {
        return caddyCommand;
    }

    public void setCaddyCommand(String caddyCommand) {
        this.caddyCommand = caddyCommand;
    }

    public boolean isEnableHttps() {
        return enableHttps;
    }

    public void setEnableHttps(boolean enableHttps) {
        this.enableHttps = enableHttps;
    }

    public String getAcmeEmail() {
        return acmeEmail;
    }

    public void setAcmeEmail(String acmeEmail) {
        this.acmeEmail = acmeEmail;
    }

    public int getMaxFiles() {
        return maxFiles;
    }

    public void setMaxFiles(int maxFiles) {
        this.maxFiles = maxFiles;
    }

    public long getMaxFileSizeBytes() {
        return maxFileSizeBytes;
    }

    public void setMaxFileSizeBytes(long maxFileSizeBytes) {
        this.maxFileSizeBytes = maxFileSizeBytes;
    }

    public long getMaxTotalSizeBytes() {
        return maxTotalSizeBytes;
    }

    public void setMaxTotalSizeBytes(long maxTotalSizeBytes) {
        this.maxTotalSizeBytes = maxTotalSizeBytes;
    }

    public List<String> getRequiredFiles() {
        return requiredFiles;
    }

    public void setRequiredFiles(List<String> requiredFiles) {
        this.requiredFiles = requiredFiles;
    }
}
