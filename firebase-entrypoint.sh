#!/bin/sh
set -ex

mkdir -p /app/firebase-data/export

firebase emulators:start \
  --only firestore,storage,ui \
  --project demo-local \
  --import=/app/firebase-data/export \
  --export-on-exit=/app/firebase-data/export