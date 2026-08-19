#!/bin/bash

SERVER_IP="104.168.134.8"
SERVER_PASSWORD="agAPP6yUmpF5f"

sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no root@"$SERVER_IP" "cd /opt/website_builder_hosting && git pull"
