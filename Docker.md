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

**Named volume `fluvial_data`**
Fluvial stocke tout en JSON dans `data/`. Ce volume survit aux `docker compose down` et aux rebuilds d'image. Ne jamais utiliser un chemin relatif `./data` en prod — un named volume est géré par Docker et ne dépend pas du répertoire de travail.

```bash
docker volume ls                    # liste les volumes
docker volume inspect fluvial_data  # détails et chemin réel sur l'hôte
```

**`read_only: true` + `tmpfs`**
Le filesystem du conteneur est en lecture seule. Les deux `tmpfs` (`/tmp` et `.next/cache`) sont des filesystems RAM temporaires nécessaires à Next.js.

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
| Sauvegarder les données | `docker run --rm -v fluvial_data:/data -v $(pwd):/backup alpine tar czf /backup/fluvial-data.tar.gz /data` |
| Restaurer une sauvegarde | `docker run --rm -v fluvial_data:/data -v $(pwd):/backup alpine tar xzf /backup/fluvial-data.tar.gz -C /` |

---

## Mise à jour de l'application

```bash
git pull
docker compose up -d --build
```

Les données dans le volume `fluvial_data` ne sont pas affectées. L'ancienne image reste disponible localement sous son digest si un rollback est nécessaire :

```bash
docker images fluvial          # liste les images avec leur digest
docker tag <digest> fluvial:rollback
docker compose up -d
```

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