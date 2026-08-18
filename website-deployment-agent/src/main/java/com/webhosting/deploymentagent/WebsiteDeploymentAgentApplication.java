package com.webhosting.deploymentagent;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.webhosting.deploymentagent.config.DeploymentProperties;
import com.webhosting.deploymentagent.config.SecurityProperties;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({DeploymentProperties.class, SecurityProperties.class})
public class WebsiteDeploymentAgentApplication {

    public static void main(String[] args) {
        SpringApplication.run(WebsiteDeploymentAgentApplication.class, args);
    }
}
