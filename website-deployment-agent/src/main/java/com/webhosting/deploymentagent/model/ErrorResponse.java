package com.webhosting.deploymentagent.model;

public class ErrorResponse {

    private boolean success;
    private String error;
    private String message;

    public ErrorResponse() {
        this.success = false;
    }

    public ErrorResponse(String error, String message) {
        this.success = false;
        this.error = error;
        this.message = message;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
