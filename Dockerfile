FROM node:6

RUN mkdir /opt/orion && \
	git clone https://git.eclipse.org/r/orion/org.eclipse.orion.client /opt/orion && \
	cd /opt/orion/modules/orionode && \
	npm install && \
	npm install node-pty
EXPOSE 8081

CMD [ "node", "/opt/orion/modules/orionode/server.js", "-w", "/opt/orion" ]
