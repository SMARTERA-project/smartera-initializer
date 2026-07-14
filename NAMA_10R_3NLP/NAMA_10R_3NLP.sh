#!/bin/sh

curl --location '$ORION_URL/ngsi-ld/v1/entities' \
--header 'Content-Type: application/json' \
--data '{
   
    "id": "urn:ngsi-ld:DistributionDCAT-AP:id:nama_10r_3nlp",
    "type": "DistributionDCAT-AP",
    "description": {
      "type": "Property",
      "value": "Inserito a mano"
    },
    "title": {
      "type": "Property",
      "value": "                                       SDMX 2 1"
    },
    "accessUrl": {
      "type": "Property",
      "value": "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/nama_10r_3nlp?format=sdmx_2.1_structured&compressed=true"
    },
    "byteSize": {
      "type": "Property",
      "value": "unknown"
    },
    "checksum": {
      "type": "Property",
      "value": "unknown"
    },
    "downloadURL": {
      "type": "Property",
      "value": "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/nama_10r_3nlp?format=sdmx_2.1_structured&compressed=true"
    },
    "language": {
      "type": "Property",
      "value": []
    },
    "license": {
      "type": "Property",
      "value": ""
    },
    "mediaType": {
      "type": "Property",
      "value": "application/xml"
    },
    "rights": {
      "type": "Property",
      "value": "http://publications.europa.eu/resource/authority/access-right/PUBLIC"
    },
    "format": {
      "type": "Property",
      "value": "XML"
    },
    "status": {
      "type": "Property",
      "value": ""
    },
    "bucketName": {
      "type": "Property",
      "value": "defaultBucket"
    },
    "prefix": {
      "type": "Property",
      "value": ""
    }
  }'