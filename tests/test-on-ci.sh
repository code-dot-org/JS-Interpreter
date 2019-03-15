#!/bin/bash

# Used as part of testing steps configured in .drone.yml. See commands in that file for prerequisite setup.

export PATH="$PATH:$(pwd)/node_modules/.bin"
RESULTS_FILE=tyrant/test-results-new-$CONTAINER_INDEX.json
./node_modules/@code-dot-org/js-interpreter-tyrant/bin/run.js --threads 1 --run --diff --verbose -i $RESULTS_FILE \
    --splitInto $CONTAINER_TOTAL --splitIndex $CONTAINER_INDEX --hostPath bin/run.js
./node_modules/@code-dot-org/js-interpreter-tyrant/bin/run.js --threads 1 --rerun --verbose -i $RESULTS_FILE --hostPath bin/run.js
t1=$?
mv $RESULTS_FILE artifacts/
exit $t1