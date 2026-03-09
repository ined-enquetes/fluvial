# Déploiement FLUVIAL avec Docker

Documentation à destination de l'équipe infra. Prérequis : Linux, Docker Engine ≥ 24, `docker compose` (plugin v2).

---

## Table des matières

- [Dockerfile](#dockerfile)
  - [Pourquoi le multi-stage ?](#pourquoi-le-multi-stage-)
  - [Les trois étapes](#etapes)
- [Docker-compose.yml](#docker-composeyml)
  - [Structure générale](#structure-générale)
  - [Configuration](#configuration)
- [Déploiement](#déploiement)
- [Opérations courantes](#opérations-courantes)
- [Mise à jour de l'application](#mise-à-jour-de-lapplication)
- [Reverse proxy](#reverse-proxy)
  - [Nginx](#nginx)
  - [Traefik](#traefik-si-déjà-en-place-sur-linfra)
- [Sécurité](#sécurité)
  - [Posture générale](#posture-générale)
  - [Scan de vulnérabilités avec Trivy](#scan-de-vulnérabilités-avec-trivy)

---

## Dockerfile

Le build est en **trois étapes** (multi-stage). Seule la dernière étape finit dans l'image finale, ce qui la garde légère.

### Pourquoi le multi-stage ?

Sans multi-stage, l'image finale embarquerait tout ce qui a servi à construire l'app : le compilateur TypeScript, les `devDependencies`, les sources `.ts`, les outils de build. Sur une app Next.js ça représente facilement 800 Mo à 1 Go.

Avec le multi-stage, Docker exécute plusieurs étapes dans des images intermédiaires **temporaires**, puis copie uniquement les artefacts utiles dans une image finale propre. Les images intermédiaires ne sont jamais publiées ni conservées.

Résultat typique sur ce projet : image finale autour de **20% de la taille originale**.

### Etapes

```
deps     → installe uniquement les dépendances de production
builder  → installe tout, compile Next.js
runner   → image finale minimale, copie uniquement les artefacts compilés
```

Le dossier `data/responses/` est créé explicitement dans l'étape `runner` via `mkdir -p` — Git ne versionne pas les dossiers vides, sans cette ligne le dossier serait absent de l'image et l'app échouerait à l'écriture des premières réponses.

---

## Docker-compose.yml

### Structure générale

```yaml
services:
  app:
    build: ...       # comment construire l'image
    restart: ...     # politique de redémarrage
    ports: ...       # exposition réseau
    volumes: ...     # persistance des données
    healthcheck: ... # surveillance
    deploy: ...      # limites de ressources
```

### Configuration

**`restart: unless-stopped`**
Redémarre automatiquement après crash ou reboot. S'arrête proprement avec `docker compose down` sans repartir tout seul.

**Volumes — séparation lecture/écriture**

L'app a des besoins distincts selon les fichiers dans `data/` :

| Fichier | Besoin | Stratégie |
|---|---|---|
| `admins.json` | Lecture seule | Bind mount `read_only: true` depuis l'hôte |
| `instances.json` | Écriture | Named volume `fluvial_instances` |
| `responses/` | Écriture | Named volume `fluvial_responses` |

`admins.json` est le seul fichier édité manuellement par l'admin — il ne doit jamais être écrasé par l'app. Les données dynamiques (instances, réponses) survivent aux redémarrages et aux rebuilds d'image via leurs named volumes.

```bash
docker volume ls                          # liste les volumes
docker volume inspect fluvial_instances   # détails et chemin réel sur l'hôte
docker volume inspect fluvial_responses
```

**`read_only: true` + `tmpfs`**
Le filesystem du conteneur est en lecture seule. Seuls les volumes déclarés explicitement sont accessibles en écriture. Les deux `tmpfs` (`/tmp` et `.next/cache`) sont des filesystems RAM temporaires nécessaires à Next.js.

**`user: "1001:1001"`**
Le processus ne tourne pas en root. L'uid/gid doit correspondre à ce qui est créé dans le Dockerfile (`adduser --uid 1001`).

**`deploy.resources`**
Plafonne à 1 CPU et 512 Mo RAM. À adapter selon le serveur.

**`healthcheck`**
Docker interroge `http://localhost:3000/` toutes les 30s. Après 3 échecs, le conteneur passe en état `unhealthy`. Utile pour les orchestrateurs et les reverse proxies qui vérifient l'état avant de router du trafic.

---

## Déploiement

### 1. Préparer l'environnement

```bash
git clone https://github.com/ined-enquetes/fluvial.git
cd fluvial

# Fichier admins
cp data/example.admins.json data/admins.json
# Éditer data/admins.json avec les vrais identifiants

# Variables d'environnement
cp .env.example .env
# Éditer .env : mettre l'URL publique finale
```

### 2. Lancer

```bash
docker compose up -d --build
```

### 3. Vérifier

```bash
docker compose ps        # état des conteneurs
docker compose logs -f   # logs en temps réel
```

---

## Opérations courantes

| Besoin | Commande |
|---|---|
| Démarrer | `docker compose up -d` |
| Arrêter | `docker compose down` |
| Rebuilder après un `git pull` | `docker compose up -d --build` |
| Logs en temps réel | `docker compose logs -f app` |
| Shell dans le conteneur | `docker compose exec app sh` |
| Sauvegarder les instances | `docker run --rm -v fluvial_instances:/data -v $(pwd):/backup alpine tar czf /backup/instances.tar.gz /data` |
| Sauvegarder les réponses | `docker run --rm -v fluvial_responses:/data -v $(pwd):/backup alpine tar czf /backup/responses.tar.gz /data` |
| Restaurer les instances | `docker run --rm -v fluvial_instances:/data -v $(pwd):/backup alpine tar xzf /backup/instances.tar.gz -C /` |
| Restaurer les réponses | `docker run --rm -v fluvial_responses:/data -v $(pwd):/backup alpine tar xzf /backup/responses.tar.gz -C /` |

---

## Mise à jour de l'application

```bash
git pull
docker compose up -d --build
```

Les données dans les volumes `fluvial_instances` et `fluvial_responses` ne sont pas affectées. L'ancienne image reste disponible localement sous son digest si un rollback est nécessaire :

```bash
docker images fluvial          # liste les images avec leur digest
docker tag <digest> fluvial:rollback
docker compose up -d
```

---

## Reverse proxy

### Nginx

Configuration minimale pour exposer Fluvial sur un sous-domaine :

```nginx
server {
    listen 80;
    server_name fluvial.exemple.fr;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name fluvial.exemple.fr;

    ssl_certificate     /etc/ssl/certs/fluvial.crt;
    ssl_certificate_key /etc/ssl/private/fluvial.key;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Headers nécessaires pour Next.js
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket (Next.js Hot Reload, pas utile en prod mais inoffensif)
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Mettre à jour `.env` en conséquence :

```bash
NEXTAUTH_URL=https://fluvial.exemple.fr
```

Puis redémarrer le conteneur pour prendre en compte la variable :

```bash
docker compose up -d
```

### Traefik (si déjà en place sur l'infra)

Ajouter les labels suivants dans le `docker-compose.yml` :

```yaml
services:
  app:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.fluvial.rule=Host(`fluvial.exemple.fr`)"
      - "traefik.http.routers.fluvial.entrypoints=websecure"
      - "traefik.http.routers.fluvial.tls.certresolver=letsencrypt"
      - "traefik.http.services.fluvial.loadbalancer.server.port=3000"
```

Traefik découvre le conteneur automatiquement via le socket Docker et gère le certificat Let's Encrypt. Aucune configuration supplémentaire si le resolver est déjà configuré.

---

## Sécurité

### Posture générale

| Mesure | Où | Détail |
|---|---|---|
| User non-root | Dockerfile + compose | uid 1001, sans shell ni mot de passe |
| `no-new-privileges` | compose `security_opt` | Interdit l'escalade de privilèges via setuid/setgid |
| `cap_drop: ALL` | compose | Supprime toutes les Linux capabilities — Node.js sur port > 1024 n'en a besoin d'aucune |
| `read_only: true` | compose | Filesystem conteneur en lecture seule, tmpfs pour /tmp et le cache Next.js |
| `admins.json` en bind mount ro | compose | Le fichier de credentials ne peut pas être modifié par l'app |
| `pids_limit: 100` | compose | Protection contre les fork bombs |
| Limites CPU/RAM | compose `deploy.resources` | Évite la saturation de l'hôte |
| Image Alpine minimale | Dockerfile | Surface d'attaque réduite |
| Multi-stage build | Dockerfile | Aucune source TS ni devDep dans l'image finale |
| Tag version mineure fixée | Dockerfile | `node:22.14.0-alpine` : Node fixé, patchs Alpine automatiques au rebuild |
| `--chown` sur COPY | Dockerfile | Les fichiers appartiennent à l'utilisateur non-root dès le build |
| Rotation des logs | compose `logging` | Évite de saturer le disque en prod |

### Scan de vulnérabilités avec Trivy

[Trivy](https://github.com/aquasecurity/trivy) scanne les CVEs dans l'image Docker (paquets Alpine et dépendances NPM). Le workflow `.github/workflows/trivy.yml` l'intègre dans la pipeline GitHub Actions avec un scan nocturne automatique.

Installation locale pour tester manuellement :

```bash
# Via Docker — pas d'installation requise
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image fluvial:latest

# Uniquement les CVEs critiques et hautes
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image \
  --severity HIGH,CRITICAL fluvial:latest
```

**Faux positifs — fichier `.trivyignore`**

Certaines CVEs remontent sur des composants non utilisés par Fluvial. Les ignorer explicitement via `.trivyignore` à la racine du repo :

```bash
# .trivyignore
# CVE dans l'utilitaire untgz (contrib/ zlib), non utilisé par Fluvial
# Patch non encore disponible dans Alpine 3.23 stable
CVE-2026-22184
```