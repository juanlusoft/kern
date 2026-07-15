# ADR-0007 - PacoPrint Holded interpretation corpus

- **Estado:** Proposed
- **Fecha:** 2026-07-15
- **Decisor:** Juan Luis, con ChatGPT como CTO/arquitecto
- **Contexto:** PacoPrint necesita mejorar la interpretacion de pedidos reales sin convertir Holded en fuente de precios
- **Base:** ADR-0003, ADR-0004, ADR-0006

## 1. Contexto

PacoPrint usa Telegram para pedir precios con lenguaje humano. Los usuarios no
siempre describen los trabajos con el mismo vocabulario que el catalogo de la
API PacoPrint.

Ejemplos:

- `lona 300x120 con termosellado y ollados cada metro`
- `dibond blanco 70x50 impresion frente y reverso iguales sin laminado`
- `carton pluma 10mm con corte escuadrado`

Kern debe transformar esos textos en una peticion determinista:

- articulo de catalogo;
- unidades;
- ancho y alto;
- atributos explicitamente indicados;
- atributos ausentes que requieren aclaracion.

El problema real no es calcular precios desde historico. El precio debe seguir
saliendo de la API PacoPrint. El problema es aprender como PacoPrint describe
trabajos reales para mejorar el mapeo entre lenguaje humano y catalogo.

Holded contiene presupuestos/pedidos historicos con descripciones reales de
lineas. Es una buena fuente de ejemplos linguisticos, pero tambien puede
contener datos personales, clientes, importes, descuentos, documentos y precios
historicos que no deben convertirse en fuente de verdad.

## 2. Decision

Se permite crear un corpus PacoPrint de interpretacion usando descripciones
historicas de Holded, con estas restricciones:

1. Holded solo aporta ejemplos linguisticos.
2. El corpus no calcula precios.
3. El precio actual sale siempre de la API PacoPrint.
4. El catalogo y los valores validos salen siempre de la API PacoPrint.
5. Los datos reales de Holded no se versionan en Git.
6. Cada caso del corpus debe estar minimizado, anonimizado y revisado.
7. El corpus no puede completar atributos desconocidos de forma silenciosa.
8. Si no hay coincidencia unica o falta un atributo obligatorio, Kern pregunta.

## 3. Limite de autoridad

Autoritativo:

- PacoPrint catalog API para articulos, restricciones y atributos validos.
- PacoPrint pricing API para precio, IVA, stock y totales.

No autoritativo:

- Holded historico para precios actuales.
- Holded historico para descuentos actuales.
- Holded historico para stock.
- Holded historico para completar opciones no dichas por el usuario.

Permitido:

- Usar lineas historicas de Holded para construir casos de interpretacion.
- Extraer sinonimos, formas de redactar y patrones reales.
- Convertir casos anonimizados en tests de parser.

Prohibido:

- Guardar clientes, documentos, emails, telefonos, direcciones, NIF/CIF, importes
  o descuentos reales en Git.
- Enviar el corpus real a un LLM externo en el MVP.
- Usar el corpus como fallback de precio.
- Usar el corpus para anadir opciones facturables no pedidas.

## 4. Formato minimo del corpus

El corpus productivo, si existe, debe vivir fuera de Git y estar protegido por
permisos de instalacion. Los fixtures de tests deben ser sinteticos o estar
anonimizados manualmente.

Formato recomendado:

```json
{
  "schema_version": "pacoprint-intent-corpus.v1",
  "example_id": "ppic_01J00000000000000000000000",
  "utterance": "lona frontlit 300x120 corte escuadrado termosellado ollado cada 100 cm",
  "target": {
    "article_id": "catalog-id-only",
    "article_name": "Lona Frontlit 510g",
    "attributes": {
      "corte": "escuadrado",
      "refuerzo": "termosellado",
      "ollado": "100"
    },
    "quantity": 1,
    "width_cm": 300,
    "height_cm": 120,
    "not_present": ["velcro"]
  },
  "label_status": "human_reviewed",
  "source": {
    "kind": "holded_historical_line",
    "batch_id": "random-non-reversible-id"
  }
}
```

Campos prohibidos en corpus versionado:

- `customer`;
- `contact`;
- `email`;
- `phone`;
- `address`;
- `tax_id`;
- `document_id`;
- `document_number`;
- `holded_id`;
- `total`;
- `subtotal`;
- `tax`;
- `iva`;
- `discount`;
- `price`;
- `amount`.

## 5. Flujo operativo

1. Exportar localmente un lote pequeno de lineas Holded recientes.
2. Proyectar cada linea a una estructura minimizada.
3. Rechazar cualquier registro con datos personales, documento o importe.
4. Revisar manualmente el articulo y atributos esperados.
5. Validar `article_id` y atributos contra el catalogo PacoPrint vivo.
6. Convertir solo casos representativos en tests.
7. No guardar exportaciones reales en Git.

## 6. Clasificacion de desajustes

Cada caso fallido debe clasificarse:

- `parser_missing_article`: el texto nombra un producto real pero Kern no lo
  encuentra.
- `parser_missing_attribute`: el producto se encuentra pero falta un atributo
  que el usuario si dijo.
- `parser_added_attribute`: Kern anade un atributo que el usuario no dijo.
- `catalog_changed`: el historico no encaja con el catalogo actual.
- `manual_historical_price`: el historico incluye precio manual, descuento,
  tarifa antigua o excepcion.
- `needs_business_review`: requiere criterio PacoPrint.

## 7. Relacion con ADR-0006

El corpus es comportamiento especifico de PacoPrint. Por tanto, su ubicacion
definitiva debe ser un modulo de empresa, por ejemplo:

```text
packages/customer-modules/pacoprint-pricing/
```

Mientras esa migracion no exista, se permite documentar y testear los casos en
los paquetes actuales de pricing PacoPrint como deuda tecnica explicitada por
ADR-0006.

## 8. Consecuencias

Ventajas:

- Mejora la interpretacion con ejemplos reales.
- Reduce invencion de opciones por parte del modelo.
- Permite crear tests realistas y repetibles.
- Mantiene la API PacoPrint como fuente de verdad.

Costes:

- Requiere revision humana de casos.
- Requiere saneamiento estricto antes de persistir.
- No sustituye a una mejora futura de modulos especificos de empresa.

## 9. Estado inicial

Los primeros casos ya identificados por feedback PacoPrint son:

- Lona Frontlit no debe incluir Velcro salvo que el usuario lo pida.
- `ollado cada 100 cm` debe resolver la opcion de `100 cm`, no la de `50 cm`.
- `Dibond blanco` debe encontrar el articulo `Dibond`; `blanco` es un
  calificador/atributo, no necesariamente parte del nombre del articulo.

Estos casos deben quedar cubiertos por tests de parser/catalogo antes de
desplegar cambios de pricing.
