# Plan operativo — CarePath Bridge (Track 2)

Oct 11, 2026 · @Jean

## Resumen

Construimos **CarePath Bridge**: un asistente que convierte instrucciones de alta en una hoja clara para el paciente, cita cada dato a su fuente y **bloquea la entrega hasta que enfermería revise la versión exacta**. Usuario principal: enfermería o coordinación de altas. Beneficiario: paciente y cuidador.

**Mensaje central para los jueces:** *"An AI that knows when to stop."* La IA reformula, pero nunca decide: los datos de medicación se copian literalmente, los conflictos bloquean la salida y solo una persona aprueba.

**Regla de idioma:**

- En español: este plan, la coordinación interna y el chat del equipo.
- En inglés: repositorio, código, README, interfaz, casos de demo, vídeo y slides.

**Cierre:** domingo 18 de octubre, 10:00 a. m. Colombia (15:00 UTC), pendiente de confirmar en el kickoff de mañana a las 10:00 a. m.

## Esta noche: checklist de Jean

Objetivo: que mañana a las 10:00 los cuatro puedan clonar el repo, arrancarlo sin GPU y empezar a trabajar en paralelo. Tope: unas 3 horas. Antes del kickoff solo se construye infraestructura genérica, nada específico de salud.

**Cuentas y equipo (30 min)**

- [ ] Confirmar que Jean, Felipe, Daniel y Edgar están en el equipo de lablab y en el AMD AI Developer Program.
- [ ] Revisar correo de créditos AMD. Si no llegaron, dejar redactado el mensaje para soporte y para el Discord.
- [ ] Cada uno genera su propia llave SSH y la guarda; nadie comparte llaves privadas.

**Repositorio (90 min)**

- [ ] Crear `carepath-bridge` en GitHub desde tu cuenta. Puede ser privado hasta la entrega; debe ser público al enviar.
- [ ] Ejecutar el prompt de Codex (Fase A, en inglés) que acompaña este plan.
- [ ] Comprobar en tu máquina: `docker compose up --build` levanta web y API, y `/health` responde.
- [ ] Primer push a `main`, CI en verde, protección de rama con una revisión obligatoria.
- [ ] Invitar a los tres compañeros como colaboradores.
- [ ] Registrar en `docs/preexisting-work.md` la fecha y lo construido antes del evento.

**Máquina AMD local (30 min, opcional)**

- [ ] Anotar CPU/GPU exactos y RAM. Probar si corre un modelo cuantizado de 1–3B. Es solo respaldo de desarrollo, no la demo.

**Cierre (15 min)**

- [ ] Enviar al grupo el mensaje de arranque: enlace al repo, comando de arranque y la primera tarea de cada uno (sección de roles).
- [ ] Dormir. Mañana a las 08:30 se revisan cuentas y estado AMD.

## Roles y responsabilidades

Jean lidera y desbloquea; cada carpeta del repo tiene un único dueño para evitar conflictos.

| Persona | Rol | Carpetas del repo | Primera tarea (lunes) | Entrega clave |
| --- | --- | --- | --- | --- |
| Jean | Líder, DevOps, backend estructural | `infra/`, `.github/`, `scripts/`, `apps/api/app/core/`, `apps/api/app/db/` | Repo, Compose y CI listos; config, sesiones y SQLite | URL pública funcionando y entrega en lablab |
| Daniel | API de dominio y seguridad funcional | `apps/api/app/api/`, `schemas/`, `services/`, `packages/contracts/` | Contrato v0 (OpenAPI) y máquina de estados | Gate de aprobación: 409 sin revisión válida |
| Felipe | IA y AMD | `apps/api/app/providers/`, `prompts/`, `eval/` | Elegir 2 modelos candidatos; adaptador vLLM | Inferencia real en AMD y informe de evaluación |
| Edgar | Frontend, UX y demo | `apps/web/` | Pantalla de revisión con fixtures y modo mock visible | Interfaz en inglés, vídeo y slides con Jean |

Reglas de colaboración:

- El contrato (`packages/contracts`) es de Daniel; cualquier cambio va por PR con aviso a Edgar y Felipe.
- Ramas cortas `feat/*` y `fix/*`, PR pequeño con una revisión, merge a `main` dos veces al día (12:30 y 18:30).
- Una tarea activa por persona en el tablero: Backlog, Ready, Doing, Review, Done.
- Edgar busca una persona de salud para 15 minutos de feedback; sin nombre ni testimonio salvo permiso.

## MVP recortado

Primero un recorrido vertical completo con un caso; todo lo demás se añade solo si el núcleo está verificado.

**Núcleo obligatorio (listo el jueves 15)**

1. Seleccionar un caso sintético precargado (en inglés).
2. El modelo en AMD devuelve JSON validado con citas: documento, página y fragmento exacto.
3. Cada campo lleva estado: `supported`, `missing`, `ambiguous` o `conflicting`.
4. Medicación copiada literalmente (nombre, dosis, unidad, vía, frecuencia, duración); `null` si falta.
5. La tabla de medicación de la hoja del paciente se genera desde los campos validados, **no desde texto del modelo**. El modelo solo reformula las partes no críticas.
6. Revisión humana por campo; la aprobación se liga a `revision_id + hash`. Editar o reprocesar invalida la aprobación.
7. `GET /patient-view` devuelve 409 sin revisión aprobada vigente.
8. Seis fixtures: dos claros, uno con datos ausentes, uno contradictorio, uno con prompt injection, uno con fallo del proveedor.
9. Medición real de tiempo (manual frente a asistido, incluyendo revisión) y latencia del modelo.

**Si sobra tiempo (en este orden)**

- Evolus con dos bloques (extractor + AI Tool de lenguaje claro o traducción). Decisión martes 12:00, máximo 2 horas.
- Carga privada de PDF/TXT con texto (5 MB, 10 páginas).
- Ampliar a 12 fixtures.
- Segundo idioma de salida para el paciente.

**Fuera de alcance**

OCR, diagnóstico, triaje, cálculo de dosis, RAG médico, chat abierto, fine-tuning, pacientes reales, integración hospitalaria, Kubernetes, Redis, colas, purga TTL automática y despliegue continuo con rollback automático.

**Acceso en la demo:** el público solo elige fixtures en una sesión aislada, sin carga de archivos. Un revisor de demo entra con contraseña del servidor y cookie HttpOnly; a los jueces se les da la credencial por el formulario de entrega.

## Arquitectura y repo

Un host CPU con Docker Compose sirve web y API; la GPU AMD vive aparte y solo se alcanza por HTTPS autenticado o túnel SSH.

&#91;embedded content: CarePath Bridge architecture · 5 components\]

El modelo solo produce un borrador; el servidor gobierna los estados y nunca acepta `approved` desde el modelo ni desde el navegador.

**Estructura del repo (en inglés)**

```text
carepath-bridge/
├── AGENTS.md              # rules for humans and coding agents
├── README.md
├── compose.yaml
├── .env.example
├── apps/
│   ├── web/               # React + TS + Vite (Edgar)
│   └── api/
│       └── app/
│           ├── core/      # config, logging, sessions (Jean)
│           ├── db/        # SQLite models, migrations (Jean)
│           ├── api/       # routes (Daniel)
│           ├── schemas/   # Pydantic models (Daniel)
│           ├── services/  # processing, review, gate (Daniel)
│           ├── providers/ # mock + openai_compatible (Felipe)
│           └── prompts/   # versioned prompts (Felipe)
├── packages/contracts/    # exported OpenAPI + TS types
├── fixtures/              # generic now; synthetic cases after kickoff
├── eval/                  # evaluation scripts and reports
├── infra/                 # Dockerfiles, amd/ runbook
├── scripts/               # doctor, smoke, smoke-amd, export-contract
├── docs/                  # architecture, setup, security, decisions, preexisting-work
└── .github/workflows/ci.yml
```

**Convenciones**

- npm con lockfile para la web; uv con `uv.lock` para la API.
- El navegador llama a la API por el proxy `/api`, nunca por el nombre interno de Docker.
- Claves solo en el backend; nada con prefijo `VITE_`. `.env` ignorado por Git.
- Si se pide modo real sin credenciales, falla explícitamente; nunca vuelve en silencio al mock.
- CI en CPU con mocks: lint, tipos, tests, build y validación de Compose. Las pruebas AMD son manuales.

## Calendario y puntos de decisión

Cada día termina con una salida verificable y, si toca, una decisión. Horas en Colombia (UTC−5).

| Día | Objetivo del día | Salida verificable | Decisión |
| --- | --- | --- | --- |
| Lun 12 | Kickoff 10:00, confirmar reglas; contrato v0 a las 12:00 | 18:00: flujo completo con mock explícito | ¿Llegaron créditos AMD? Si no, escalar en Discord |
| Mar 13 | Revisión, aprobación con hash, `patient-view` bloqueado | Exportar sin aprobar falla con 409 | 12:00: Evolus sí/no |
| Mié 14 | Fixtures adversos, errores del proveedor, despliegue CPU con HTTPS | URL pública abre desde incógnito | Sin acceso AMD: activar plan B con la organización |
| Jue 15 | Inferencia real en AMD, evaluación y medición de tiempo | Informe con numerador/denominador | 22:00: congelar funciones |
| Vie 16 | Versión candidata desplegada; vídeo v1, slides, borrador del formulario | Vídeo grabado con ejecución real | Qué extras entran o salen |
| Sáb 17 | Pulido, prueba externa, vídeo final | Entrega interna completa a las 18:00 | Revisión cruzada por otro compañero |
| Dom 18 | Envío final | Enviado a las 08:00, cierre 10:00 | — |

Ritual diario: 08:30 estado de cuentas y bloqueos (10 min); integraciones a las 12:30 y 18:30; revisión de demo de 20 minutos al cierre del día.

## Plan AMD

AMD es requisito para optar a premios, así que es el mayor riesgo del proyecto. Mientras llegan los créditos, todo se desarrolla con el proveedor mock; el mock nunca se presenta como inferencia real.

**Escalera de respaldo**

| Situación | Acción | Dueño |
| --- | --- | --- |
| Lunes sin créditos | Preguntar en el kickoff y en el Discord de lablab por acceso alternativo | Jean |
| Martes sin acceso | Escalar a soporte AMD con la confirmación de la solicitud | Jean + Felipe |
| Miércoles sin acceso | Acordar con la organización una vía aprobada o usar la máquina local AMD como evidencia mínima | Equipo |
| Créditos tarde | Un modelo, un flujo, dos casos; cancelar Evolus y extras | Felipe + Daniel |
| Sin ejecución AMD | Entrega transparente; no afirmar que se cumple el requisito | Jean |

**Sobre la máquina local:** la página acepta Radeon y Ryzen AI, así que un modelo pequeño cuantizado corriendo ahí podría servir como evidencia mínima. No sirve para el premio de Evolus, que exige un endpoint vLLM propio en AMD Developer Cloud.

**Cuando lleguen los créditos**

1. Jean confirma saldo, vencimiento y tarifa por hora en la consola; crea una sola VM.
2. Felipe levanta vLLM con la imagen oficial ROCm, con el modelo pequeño o mediano que pase la prueba de JSON. No saltar a 70B.
3. Validar `/v1/models`, luego una generación corta, luego el JSON de un fixture.
4. Exponer solo por túnel SSH o HTTPS con autenticación; nunca el puerto abierto.
5. Grabar una ejecución real lo antes posible, antes de gastar en extras.

**Presupuesto orientativo sobre US$100**

| Uso | Reserva |
| --- | --: |
| Arranque y verificación | US$15 |
| Integración y evaluación | US$30 |
| Demo, grabación y ventana de jueces | US$35 |
| Contingencia | US$20 |

Apagar la VM no detiene el cobro; destruirla sí. Antes de destruirla, guardar scripts, configuración y evidencia.

**Evidencia AMD para la entrega:** captura de la GPU visible, modelo y versión, imagen usada y una ejecución con `request_id` y latencia que aparezca en la demo. Sin secretos en ninguna captura.

## Demo, pitch y entrega

El momento más memorable es el caso conflictivo bloqueado, así que recibe casi un tercio del vídeo. Todo en inglés.

**Guion del vídeo (3 minutos)**

| Tiempo | Bloque | Qué se ve |
| --- | --- | --- |
| 0:00–0:20 | The problem | Enfermera con una hoja de alta densa; quién usa el producto |
| 0:20–1:05 | Clear case | Fuente a la izquierda, borrador con citas a la derecha, aprobación, hoja final |
| 1:05–1:55 | It knows when to stop | Dos instrucciones contradictorias; salida bloqueada en UI y API (409) |
| 1:55–2:20 | Powered by AMD | GPU, modelo, `request_id` y latencia reales |
| 2:20–2:45 | What we measured | Tiempo manual frente a asistido; límites honestos |
| 2:45–3:00 | Who pays | Coordinación de altas en clínicas; siguiente validación |

**Slides (6):** usuario y tarea · problema actual · demo del recorrido · controles y caso bloqueado · arquitectura AMD y métricas · equipo, comprador y siguiente paso.

**Valor de negocio:** un modelo simple, marcado como supuesto: minutos ahorrados por alta × altas diarias × coste por hora de enfermería. Solo se usan números medidos o con fuente citada; si no hay profesional de salud, se habla de "demo review", no de validación clínica.

**Checklist de entrega (sábado 18:00)**

- [ ] Repo público, abre en incógnito; licencia MIT, README que funciona.
- [ ] URL de la demo con fixtures y credencial de revisor para jueces.
- [ ] Vídeo con ejecución real y el bloqueo; sin datos personales.
- [ ] Slides, imagen de portada, descripción corta y larga.
- [ ] Evidencia AMD y lista de tecnologías realmente usadas.
- [ ] Limitaciones conocidas y costes marcados como estimación.
- [ ] Formulario enviado y confirmación revisada por Jean y Daniel.

## Riesgos y preguntas para la organización

| Riesgo | Señal temprana | Respuesta |
| --- | --- | --- |
| Créditos AMD tardan | Sin correo el martes | Escalera de respaldo del plan AMD |
| Alcance demasiado grande | Flujo mock incompleto el lunes 18:00 | Cortar extras; nada nuevo hasta cerrar el núcleo |
| El modelo altera una dosis | Falla la prueba de fidelidad | Medicación siempre desde campos validados, no desde texto libre |
| Evolus consume tiempo | Sin dos bloques funcionando el martes 12:00 | Descartarlo y mantener el flujo directo |
| Integración tardía | PR grandes o conflictos en el contrato | Merges a las 12:30 y 18:30; contrato solo por PR de Daniel |
| Demo cae en vivo | Error durante la grabación | Vídeo real previo, rotulado como grabación |

**Preguntas para el kickoff o el Discord**

- ¿Qué trabajo previo se permite (scaffold genérico) y cómo se declara?
- ¿Se confirma el cierre el domingo 18 a las 15:00 UTC?
- ¿Duración y formato definitivos del vídeo?
- ¿Qué acceso AMD alternativo aceptan si los créditos tardan? ¿Vale hardware Radeon o Ryzen propio?
- ¿Qué evidencia de ejecución en AMD esperan y cuánto tiempo debe quedar viva la demo?
