package com.webhosting.deploymentagent.exception;

import org.springframework.http.HttpStatus;

public class DeploymentException extends RuntimeException {

    private final String errorCode;
    private final HttpStatus httpStatus;

    public DeploymentException(String errorCode, String message, HttpStatus httpStatus) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }

    public DeploymentException(String errorCode, String message, HttpStatus httpStatus, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}
