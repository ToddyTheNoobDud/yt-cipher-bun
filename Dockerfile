FROM oven/bun:latest

WORKDIR /usr/src/app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN bun install --frozen-lockfile || bun install

COPY . .

ARG EJS_REPO=https://github.com/kikkia/ejs.git
ARG EJS_REF=2aa16f2ecb1629921eb17a5c4872827bc09a9edb
RUN set -e; \
	if [ ! -f ejs/src/yt/solver/main.ts ]; then \
		echo "ejs submodule missing, fetching ${EJS_REF} from ${EJS_REPO}"; \
		rm -rf ejs; \
		git clone "${EJS_REPO}" ejs; \
		cd ejs; \
		git checkout "${EJS_REF}"; \
		cd /usr/src/app; \
	fi

RUN test -f ejs/src/yt/solver/main.ts

RUN mkdir -p player_cache

EXPOSE 8080

CMD ["bun", "run", "server.ts"]
