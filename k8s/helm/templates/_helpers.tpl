{{/*
Expand the name of the chart.
*/}}
{{- define "distributed-systems-showcase.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "distributed-systems-showcase.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "distributed-systems-showcase.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "distributed-systems-showcase.labels" -}}
helm.sh/chart: {{ include "distributed-systems-showcase.chart" . }}
{{ include "distributed-systems-showcase.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "distributed-systems-showcase.selectorLabels" -}}
app.kubernetes.io/name: {{ include "distributed-systems-showcase.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "distributed-systems-showcase.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "distributed-systems-showcase.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the config map
*/}}
{{- define "distributed-systems-showcase.configMapName" -}}
{{- include "distributed-systems-showcase.fullname" . }}-config
{{- end }}

{{/*
Create the name of the secret
*/}}
{{- define "distributed-systems-showcase.secretName" -}}
{{- include "distributed-systems-showcase.fullname" . }}-secret
{{- end }}

{{/*
Image name
*/}}
{{- define "distributed-systems-showcase.image" -}}
{{- $registry := .Values.global.imageRegistry | default .Values.app.image.registry -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry .Values.app.image.repository (.Values.app.image.tag | default .Chart.AppVersion) -}}
{{- else -}}
{{- printf "%s:%s" .Values.app.image.repository (.Values.app.image.tag | default .Chart.AppVersion) -}}
{{- end -}}
{{- end }}

{{/*
Environment variables
*/}}
{{- define "distributed-systems-showcase.env" -}}
- name: NODE_ENV
  value: {{ .Values.app.env.NODE_ENV | quote }}
- name: PORT
  value: {{ .Values.app.env.PORT | quote }}
- name: DATABASE_URL
  value: "postgresql://postgres:{{ .Values.postgresql.auth.postgresPassword }}@{{ include "distributed-systems-showcase.fullname" . }}-postgresql:5432/{{ .Values.postgresql.auth.database }}"
- name: CLICKHOUSE_URL
  value: "http://{{ include "distributed-systems-showcase.fullname" . }}-clickhouse:8123"
- name: KAFKA_BROKERS
  value: "{{ include "distributed-systems-showcase.fullname" . }}-kafka:9092"
- name: GRPC_WALLET_URL
  value: "{{ include "distributed-systems-showcase.fullname" . }}-wallet:50051"
{{- end }}
