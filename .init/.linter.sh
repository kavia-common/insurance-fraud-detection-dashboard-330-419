#!/bin/bash
cd /home/kavia/workspace/code-generation/insurance-fraud-detection-dashboard-330-419/fraud_detection_api
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

