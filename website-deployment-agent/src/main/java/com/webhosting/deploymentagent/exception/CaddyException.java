package com.webhosting.deploymentagent.exception;

import org.springframework.http.HttpStatus;

public class CaddyException extends DeploymentException {

    public CaddyException(String errorCode, String message, HttpStatus httpStatus) {
        super(errorCode, message, httpStatus);
    }

    public CaddyException(String errorCode, String message, HttpStatus httpStatus, Throwable cause) {
        super(errorCode, message, httpStatus, cause);
    }
}
