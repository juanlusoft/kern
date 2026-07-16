# PacoPrint API price diagnostics

This runbook documents how to verify whether a PacoPrint pricing issue comes
from Kern interpretation or from the PacoPrint web/API itself.

Do not commit PacoPrint API tokens, customer names, document ids, order ids,
phone numbers, emails or raw customer conversations.

## Source of truth

For current PacoPrint prices, Kern must use:

```text
GET  https://pacoprint.com/api/v1/catalogo/estructura
POST https://pacoprint.com/api/v1/catalogo/calcular-precio
```

The token is provided at runtime through `PACOPRINT_API_TOKEN`.

Holded historical documents are not a pricing source. They may be used only to
learn how PacoPrint describes real jobs and to improve interpretation.

## Diagnostic rule

When PacoPrint reports a wrong answer, split the investigation:

1. Does the API catalog contain the article and required options?
2. Did Kern map the user text to the right article and option ids?
3. Does the API return the expected price for the exact payload?
4. If the payload is correct but the API price differs from the expected
   business price, escalate to PacoPrint/web owner as a catalog/pricing data
   issue or missing commercial condition.

Do not adjust Kern to force a price unless PacoPrint explicitly confirms a
deterministic business rule that belongs in Kern.

## Safe API checks

Run from an environment where `PACOPRINT_API_TOKEN` is already set:

```bash
node - <<'NODE'
const token = process.env.PACOPRINT_API_TOKEN;
if (!token) throw new Error('PACOPRINT_API_TOKEN missing');

const base = 'https://pacoprint.com/api/v1';
const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`
};

async function quote(name, body) {
  const res = await fetch(`${base}/catalogo/calcular-precio`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const response = await res.json();
  console.log(JSON.stringify({
    name,
    status: res.status,
    ok: res.ok,
    request: body,
    response: {
      neto_unitario: response.neto_unitario,
      neto_base: response.neto_base,
      neto_total: response.neto_total,
      iva: response.iva,
      total: response.total,
      stock: response.stock
    }
  }, null, 2));
}

await quote('lona_300x120_refuerzo_ollado100_sin_diseno', {
  articulo_id: 1,
  unidades: 1,
  alto: 120,
  ancho: 300,
  atributos: {
    '1': 1,
    '23': 120,
    '24': 300,
    '7': 22,
    '8': 117,
    '4': 17,
    '3': 30
  }
});

await quote('lona_300x120_refuerzo_ollado100_con_diseno', {
  articulo_id: 1,
  unidades: 1,
  alto: 120,
  ancho: 300,
  atributos: {
    '1': 1,
    '23': 120,
    '24': 300,
    '6': 1,
    '7': 22,
    '8': 117,
    '4': 17,
    '3': 30
  }
});

await quote('dibond_70x50_5uds_blanco_doble_cara_sin_laminado', {
  articulo_id: 12,
  unidades: 5,
## Checked cases

### Dibond blanco

Customer-facing problem observed:

```text
5 unidades de dibond blanco de 70x50 cm, 1 dise?o diferente,
impresi?n frente y reverso iguales, corte escuadrado, sin laminado.
```

Current API catalog contains the required structure:

```text
article: Dibond
article_id: 12
Color Blanco: 10=160
Impresi?n Frente y reverso iguales: 7=333
Corte Escuadrado: 8=117
Laminado Sin Laminado: 14=175
```

Conclusion:

```text
If Kern returns "Articulo no encontrado" for this case, the fault is in Kern
interpretation/search, not in the PacoPrint catalog.
```

### Lona Frontlit 510g, 300x120, refuerzo, ollado 100, no velcro

Use the no-design payload as the default when the user did not ask for design changes.
The with-6 payload below is only for comparison.

Payload without attribute 6:

```json
{
  "articulo_id": 1,
  "unidades": 1,
  "alto": 120,
  "ancho": 300,
  "atributos": {
    "1": 1,
    "23": 120,
    "24": 300,
    "7": 22,
    "8": 117,
    "4": 17,
    "3": 30
  }
}
```

Comparison payload with attribute 6 added only for diagnosis:

```json
{
  "articulo_id": 1,
  "unidades": 1,
  "alto": 120,
  "ancho": 300,
  "atributos": {
    "1": 1,
    "23": 120,
    "24": 300,
    "6": 1,
    "7": 22,
    "8": 117,
    "4": 17,
    "3": 30
  }
}
```

Meaning:

```text
Lona Frontlit 510g
300x120 cm
1 unit
No design change requested by the user
Anverso/frente
Corte Escuadrado
Refuerzo Termosellado todo el per?metro
Ollado met?lico todo el per?metro cada 100 cm
No Velcro attribute present
```

Observed API response on 2026-07-16 from the PacoPrint runtime environment for the with-6 comparison payload:

```text
neto_total: 48.71
total IVA incluido: 58.94
```

If the no-6 payload differs from the with-6 payload, the delta can come from Kern sending the extra attribute, not necessarily from PacoPrint applying a different commercial rule. Do not label `"6": 1` as correct unless the user explicitly asked for design changes.

Conclusion:

```text
Use the no-6 payload as the default when the user did not mention design.
Compare with the with-6 payload only to isolate whether Kern is inflating the request with an extra attribute.
```
## Evidence handling

For future discrepancies, store only:

```text
- timestamp
- installation id
- article id
- safe article name
- normalized dimensions/units
- selected attribute ids and labels
- API net/IVA/total
- expected business price if PacoPrint provides it
- conclusion: Kern interpretation / API data / needs business review
```

Do not store:

```text
- API token
- Telegram ids
- customer names
- document/order ids
- raw chat text
- full Holded documents
```

## Escalation template

```text
Caso:
- Artículo:
- Medidas:
- Unidades:
- Opciones:
- Payload sin token:
- Precio API:
- Precio esperado por PacoPrint:
- Diferencia:

Conclusión técnica:
- El payload no incluye opciones no solicitadas.
- Si el precio esperado es correcto, revisar reglas/datos de la web/API.
```
