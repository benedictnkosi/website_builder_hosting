package com.webhosting.deploymentagent.exception;

import org.springframework.http.HttpStatus;

public class InvalidDomainException extends DeploymentException {

    public InvalidDomainException(String message) {
        super("INVALID_DOMAIN", message, HttpStatus.BAD_REQUEST);
    }
}
