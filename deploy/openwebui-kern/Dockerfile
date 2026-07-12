FROM ghcr.io/open-webui/open-webui:v0.10.2

COPY branding/ /opt/branding/

RUN chmod 0755 /opt/branding/start-kern.sh /opt/branding/validate-env.sh /opt/branding/apply-kern-runtime-patches.py \
  && python /opt/branding/apply-kern-runtime-patches.py

CMD ["bash", "/opt/branding/start-kern.sh"]
