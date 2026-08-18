package com.webhosting.deploymentagent.exception;

import org.springframework.http.HttpStatus;

public class InvalidFilePathException extends DeploymentException {

    public InvalidFilePathException(String message) {
        super("INVALID_FILE_PATH", message, HttpStatus.BAD_REQUEST);
    }
}
