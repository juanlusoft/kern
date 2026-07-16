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

await quote('lona_300x120_refuerzo_ollado100_sin_velcro', {
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
  alto: 50,
  ancho: 70,
  atributos: {
    '1': 5,
    '23': 50,
    '24': 70,
    '6': 1,
    '10': 160,
    '7': 333,
    '8': 117,
    '14': 175
  }
});
NODE
```

## Checked cases

### Dibond blanco

Customer-facing problem observed:

```text
5 unidades de dibond blanco de 70x50 cm, 1 diseño diferente,
impresión frente y reverso iguales, corte escuadrado, sin laminado.
```

Current API catalog contains the required structure:

```text
article: Dibond
article_id: 12
Color Blanco: 10=160
Impresión Frente y reverso iguales: 7=333
Corte Escuadrado: 8=117
Laminado Sin Laminado: 14=175
```

Conclusion:

```text
If Kern returns "Artículo no encontrado" for this case, the fault is in Kern
interpretation/search, not in the PacoPrint catalog.
```

### Lona Frontlit 510g, 300x120, refuerzo, ollado 100, no velcro

Payload:

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
1 design
Anverso/frente
Corte Escuadrado
Refuerzo Termosellado todo el perímetro
Ollado metálico todo el perímetro cada 100 cm
No Velcro attribute present
```

Observed API response on 2026-07-16 from the PacoPrint runtime environment:

```text
neto_total: 48.71
total IVA incluido: 58.94
```

API component breakdown observed:

```text
base + corte: 38.90 neto
base + corte + refuerzo: 47.11 neto
base + corte + refuerzo + ollado 100: 48.71 neto
base + corte + refuerzo + ollado 50: 50.51 neto
```

If PacoPrint expects `46.71` net, this is not caused by Kern adding Velcro. With
the exact no-Velcro payload above, the API returns `48.71`.

Conclusion:

```text
This case needs PacoPrint/web validation: either the web API pricing data is
wrong, or there is a commercial/catalog condition that is not represented in
the payload.
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
