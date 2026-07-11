# ADR-0005 — Dockerized per-installation production deployment

- **Estado:** Accepted
- **Fecha:** 2026-07-11
- **Decisor:** Juan Luis, con ChatGPT como CTO/arquitecto
- **Contexto:** Despliegue de Kern para varias empresas en la misma Spark
- **Base:** ADR-0002, ADR-0003, ADR-0004, smoke real Numa/OpenWebUI/Kern

## 1. Contexto

Kern debe poder servir varias empresas o instalaciones.

En una misma Spark pueden coexistir empresas como MiPC, PacoPrint, Proinsur o Numa. Cada una puede tener:

- su propia aplicacion de negocio;
- su propia base de datos o API externa;
- sus propios usuarios;
- sus propios secretos;
- su propio modelo expuesto en OpenWebUI;
- sus propios logs, evidence ledger y datos operativos.

Kern ya esta orientado a multi-tenant por diseno:

- `installation_id`;
- `organization_id`;
- identity mappings;
- modulos activos por instalacion;
- ports and adapters;
- fail-closed si falta identidad, mapping, modulo o configuracion;
- separacion entre Core, runtime, channels y adapters.

Pero multi-tenant no obliga a desplegar todas las empresas dentro del mismo proceso. Hay que fijar el modelo operativo de produccion para evitar forks por cliente y, a la vez, evitar que una empresa pueda afectar o exponer datos de otra.

## 2. Decision

### 2.1 Kern se despliega en Docker

En produccion, Kern se despliega como imagen Docker versionada e identificada por digest inmutable.

No se considera instalacion limpia de produccion ejecutar Kern directamente con `npm`, `tsx` o scripts temporales sobre un checkout local.

El modo bare metal queda limitado a:

- desarrollo;
- debug;
- smoke temporal;
- emergencia operativa acotada.

### 2.2 Misma imagen, instalaciones separadas

Las empresas no deben tener forks del repositorio ni copias divergentes del codigo.

Todas las empresas deben usar la misma imagen de producto Kern, fijada por digest inmutable. Las tags semanticas pueden usarse como alias humano, pero la instalacion productiva debe registrar el digest exacto ejecutado.

La separacion por empresa se hace mediante:

- carpeta de instalacion;
- configuracion propia;
- secretos propios;
- volumen de datos propio;
- logs propios;
- contenedor propio en la fase inicial de produccion.

Ejemplo:

```text
/opt/kern/
  compose/
    docker-compose.yml
  installations/
    mipc/
      installation.json
      env.runtime
      data/
      logs/
      evidence/
      memory/
    pacoprint/
      installation.json
      env.runtime
      data/
      logs/
      evidence/
      memory/
    proinsur/
      installation.json
      env.runtime
      data/
      logs/
      evidence/
      memory/
  backups/
    mipc/
    pacoprint/
    proinsur/
```

### 2.3 Contenedor por empresa en produccion temprana

Mientras Kern v2 madura y coexiste con Kern v1 u otras instalaciones historicas, el despliegue recomendado es un contenedor por empresa:

```text
kern-mipc
kern-pacoprint
kern-proinsur
```

Todos usan la misma imagen Kern por digest.

Cada contenedor monta solo la instalacion de su empresa.

Ejemplo:

```yaml
services:
  kern-proinsur:
    image: ghcr.io/juanlusoft/kern-runtime@sha256:<digest>
    container_name: kern-proinsur
    user: "1000:1000"
    read_only: true
    env_file:
      - /opt/kern/installations/proinsur/env.runtime
    environment:
      KERN_RUNTIME_CONFIG_PATH: /app/config/installation.json
      KERN_EVIDENCE_FILE_PATH: /app/evidence/evidence.jsonl
    volumes:
      - /opt/kern/installations/proinsur/installation.json:/app/config/installation.json:ro
      - /opt/kern/installations/proinsur/data:/app/data
      - /opt/kern/installations/proinsur/logs:/app/logs
      - /opt/kern/installations/proinsur/evidence:/app/evidence
      - /opt/kern/installations/proinsur/memory:/app/memory
    networks:
      - kern-proinsur-private
      - openwebui-backend
    ports:
      - "127.0.0.1:8790:8787"

networks:
  kern-proinsur-private:
    internal: true
  openwebui-backend:
    external: true
```

El ejemplo es normativo en estos puntos:

- el runtime debe recibir `KERN_RUNTIME_CONFIG_PATH` o `KERN_RUNTIME_CONFIG_JSON`;
- el path de evidence ledger debe apuntar a un volumen de la instalacion mediante `runtime_options.evidence_ledger_file_path` o `KERN_EVIDENCE_FILE_PATH`;
- el path de conversation memory debe apuntar a un volumen de la instalacion mediante `runtime_options.conversation_memory_file_path`;
- el puerto no debe publicarse en todas las interfaces;
- el contenedor no debe ejecutarse con privilegios innecesarios;
- la imagen productiva debe quedar fijada por digest.

### 2.4 OpenWebUI puede ser compartido

Varias empresas pueden usar el mismo OpenWebUI si cada empresa se registra como modelo o endpoint separado y existe control de acceso que impida a un usuario seleccionar modelos de otra empresa.

Ejemplo:

```text
kern-proinsur  -> http://kern-proinsur:8787/v1
kern-mipc      -> http://kern-mipc:8787/v1
kern-pacoprint -> http://kern-pacoprint:8787/v1
```

OpenWebUI debe reenviar identidad de usuario mediante headers cuando el canal lo requiera.

Ejemplo:

```text
ENABLE_FORWARD_USER_INFO_HEADERS=true
X-OpenWebUI-User-Id
```

Cada contenedor Kern debe mapear solo los usuarios permitidos para su instalacion.

OpenWebUI no es por si solo una frontera suficiente si el puerto de Kern queda accesible directamente.

La frontera de confianza debe cumplir:

- los puertos de Kern no se exponen publicamente;
- OpenWebUI o el reverse proxy autentica al usuario;
- el proxy elimina cualquier `X-OpenWebUI-User-Id` entrante del cliente y solo despues inyecta el header autenticado;
- cada usuario o grupo tiene ACL explicita para los modelos/endpoints de su empresa;
- un usuario de MiPC no puede ver ni seleccionar el modelo de PacoPrint, Proinsur o Numa;
- si OpenWebUI no permite imponer esa ACL de forma suficiente, se debe usar un reverse proxy o una instancia separada por empresa.

`host.docker.internal` no debe asumirse como portable en Linux/Spark. Debe preferirse DNS de servicio en una red Docker controlada. Si se usa `host.docker.internal`, el compose debe declarar explicitamente el mecanismo equivalente, por ejemplo `extra_hosts: host.docker.internal:host-gateway`, y documentar que es una excepcion operativa.

### 2.5 Aislamiento obligatorio

Un contenedor de una empresa no debe tener:

- secretos de otra empresa;
- `installation.json` de otra empresa;
- conexion a la BBDD/API de otra empresa;
- logs de otra empresa;
- evidence ledger de otra empresa;
- fallback de identidad u organizacion.

Si una request llega sin usuario mapeado, sin organizacion, sin modulo activo o con configuracion incompleta, debe fallar cerrado.

El aislamiento debe ser tambien de red:

- red Docker privada por instalacion;
- allowlist de salida a las BBDD/APIs propias;
- sin acceso lateral a BBDD/APIs de otras empresas;
- sin montar sockets Docker ni volumenes compartidos que permitan escapar de la instalacion;
- reverse proxy o OpenWebUI como unico punto compartido cuando sea necesario.

Cada instalacion debe tener un preflight de arranque que bloquee el servicio antes de aceptar trafico si detecta:

- `installation_id` ausente;
- `organization_id` ausente;
- modulos activos sin configuracion requerida;
- secretos requeridos ausentes;
- identity mappings sin `organization_id`;
- identity mappings que apunten a una organizacion distinta de la instalacion;
- principal/subject no permitido para la instalacion;
- rutas de evidence, memory, data o logs fuera de la carpeta de la instalacion;
- configuracion de canal que permita fallback inseguro.

### 2.6 Backups por instalacion, no por contenedor

No se hace backup del contenedor como fuente de verdad.

El contenedor es reemplazable por la imagen versionada.

Se debe respaldar por empresa:

- `installation.json`;
- `env.runtime` o secretos gestionados de forma segura;
- `data/`;
- `logs/` cuando proceda;
- evidence ledger;
- conversation memory;
- estado operativo propio de la instalacion;
- digest exacto de la imagen Kern usada.

`env.runtime` contiene secretos o referencias a secretos. No debe tratarse como un backup ordinario sin controles. Debe respaldarse mediante el mecanismo seguro elegido para secretos, con permisos restrictivos, cifrado si procede, trazabilidad de restauracion y procedimiento de rotacion.

Las conversaciones, memoria, evidencias y backups de una instalacion nunca se restauran ni se comparten en otra instalacion.

Tambien se debe respaldar globalmente:

- `docker-compose.yml`;
- configuracion de reverse proxy si existe;
- certificados si aplica;
- version/digest de OpenWebUI, Qwen u otros servicios compartidos.

Las BBDD o APIs externas de cada empresa son fuentes de verdad externas. El backup de Kern no sustituye el backup de esas fuentes. Cada empresa debe tener su propio procedimiento de backup y restore de su BBDD/API.

### 2.7 Base de datos y permisos

Si una empresa usa BBDD, Kern debe conectarse con un usuario de solo lectura cuando la capability sea de lectura.

Para PostgreSQL:

- rol especifico, por ejemplo `kern_ro`;
- permisos `SELECT` necesarios;
- sin `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `CREATE` ni `TRUNCATE`;
- queries cerradas;
- parametros ligados;
- `statement_timeout`;
- scope por empresa cuando el esquema lo requiera.

No se debe usar un superusuario como `postgres` en produccion salvo emergencia temporal documentada.

## 3. Consecuencias

### 3.1 Consecuencias positivas

- Evita forks del codigo por cliente.
- Permite actualizar Kern de forma controlada por imagen.
- Mantiene aislamiento operativo fuerte por empresa.
- Reduce riesgo de fuga de datos entre empresas.
- Permite rollback por empresa.
- Permite backups y restores por empresa.
- Permite convivir con Kern v1 u otros sistemas existentes durante la transicion.
- Alinea despliegue con ADR-0002: modulos y adapters por instalacion.

### 3.2 Costes y trade-offs

- Hay mas contenedores que operar.
- Hay mas puertos/endpoints que documentar.
- Hay que mantener plantillas de instalacion y runbooks.
- Hay que evitar drift entre instalaciones.
- Hace falta disciplina para no editar contenedores manualmente.
- Hace falta configurar ACLs de OpenWebUI o proxy por empresa.
- Hace falta documentar y probar restores por instalacion.

### 3.3 Evolucion futura

El objetivo a medio plazo puede ser un runtime Kern multi-tenant compartido con varias instalaciones dentro del mismo proceso.

Ese paso solo debe hacerse cuando existan:

- observabilidad por tenant;
- limites por tenant;
- logs y evidence segregados;
- gestion de secretos madura;
- preflight bloqueante por instalacion;
- tests de aislamiento multi-tenant;
- pruebas negativas de acceso cruzado entre empresas;
- estrategia de rollback;
- capacidad de escalar replicas del mismo producto.

Hasta entonces, produccion temprana usa contenedor por empresa, misma imagen.

## 4. Out of scope

Este ADR no define:

- formato final de imagen Docker;
- registry definitivo;
- pipeline CI/CD;
- orquestacion Kubernetes;
- sistema de secretos definitivo;
- politica completa de retencion de backups;
- migracion de Kern v1 a Kern v2;
- consolidacion futura en un unico runtime multi-tenant.

Tampoco implica mover instalaciones existentes ni modificar servicios en produccion.
