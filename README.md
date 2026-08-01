# Guía Normativa SLEP

Este proyecto publica una guía orientativa con enlaces a los textos vigentes de LeyChile.

## Decisión de seguridad jurídica

La versión anterior ofrecía una búsqueda sobre copias estáticas de las leyes 21.040 y 21.109. Esas copias provenían de documentos de 2017 y 2018 y no representaban de forma confiable todas las modificaciones vigentes en 2026. En particular, la extracción de la Ley 21.040 confundía artículos permanentes con disposiciones transitorias.

Por esta razón:

- el frontend ya no reproduce artículos completos ni ofrece resúmenes generados automáticamente;
- las rutas antiguas `/api/articulos` y `/api/buscar` responden con estado `410`;
- cada ficha enlaza al texto oficial de la Biblioteca del Congreso Nacional;
- la página muestra una fecha de revisión y una advertencia de alcance.

Los archivos PDF, JSON y procesadores anteriores se conservan únicamente como antecedentes históricos del repositorio. **No deben reutilizarse como fuente jurídica vigente.**

## Verificación local

```bash
npm install
npm test
npm start
```
