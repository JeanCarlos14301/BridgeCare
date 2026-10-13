import re
from typing import Literal

from app.schemas.domain import PatientFollowUp, PatientMedicationRow, PatientView

SPANISH_NOTICE = (
    "Esta hoja fue preparada con asistencia de IA y aprobada por un revisor del "
    "equipo de atención. Siga las instrucciones de su equipo médico y contáctelos "
    "ante cualquier duda."
)

ROUTE_MAP_ES: dict[str, str] = {
    "by mouth": "vía oral",
    "oral": "vía oral",
    "po": "vía oral",
    "intravenous": "intravenosa",
    "iv": "intravenosa",
    "topical": "tópica",
    "subcutaneous": "subcutánea",
    "subcutaneously": "subcutáneamente",
    "inhalation": "inhalatoria",
    "rectal": "rectal",
    "intramuscular": "intramuscular",
    "im": "intramuscular",
}

FREQUENCY_MAP_ES: dict[str, str] = {
    "once daily": "una vez al día",
    "once a day": "una vez al día",
    "daily": "al día",
    "twice daily": "dos veces al día",
    "twice a day": "dos veces al día",
    "three times daily": "tres veces al día",
    "three times a day": "tres veces al día",
    "four times daily": "cuatro veces al día",
    "four times a day": "cuatro veces al día",
    "every 4 hours": "cada 4 horas",
    "every 4 hours as needed": "cada 4 horas según sea necesario",
    "every 6 hours": "cada 6 horas",
    "every 6 hours as needed": "cada 6 horas según sea necesario",
    "every 8 hours": "cada 8 horas",
    "every 8 hours as needed": "cada 8 horas según sea necesario",
    "every 8 hours as needed for pain": "cada 8 horas según sea necesario para el dolor",
    "every 12 hours": "cada 12 horas",
    "every 24 hours": "cada 24 horas",
    "at bedtime": "al acostarse",
    "with meals": "con las comidas",
    "before meals": "antes de las comidas",
    "as needed": "según sea necesario",
}

INSTRUCTION_MAP_ES: dict[str, str] = {
    "see your primary care clinician": (
        "Consulte a su médico o profesional de atención primaria"
    ),
    "arrange follow-up with your primary care clinician": (
        "Coordine una cita de seguimiento con su médico de atención primaria"
    ),
    "follow up with your primary care clinician": (
        "Consulte a su médico de atención primaria para seguimiento"
    ),
}

WARNING_SIGNS_MAP_ES: dict[str, str] = {
    "trouble breathing": "Dificultad para respirar",
    "blue lips": "Labios azulados",
    "new confusion": "Confusión nueva o desorientación",
    "high fever": "Fiebre alta",
    "fever": "Fiebre",
    "chest pain": "Dolor en el pecho",
    "shortness of breath": "Falta de aire",
    "redness or swelling": "Enrojecimiento o hinchazón",
    "worsening pain": "Dolor que empeora",
    "persistent vomiting": "Vómitos persistentes",
    "inability to keep fluids down": "Incapacidad para retener líquidos",
    "severe headache": "Dolor de cabeza intenso",
    "signs of infection": "Signos de infección",
}

ACTIVITY_MAP_ES: dict[str, str] = {
    "rest at home": "Descanse en casa",
    "rest at home for 3 days": "Descanse en casa durante 3 días",
    "rest at home for 3 days.": "Descanse en casa durante 3 días.",
    "avoid heavy lifting": "Evite levantar objetos pesados",
    "light activity as tolerated": "Actividad ligera según tolere",
    "resume normal activity as tolerated": "Reanude su actividad normal según tolere",
}

DIET_MAP_ES: dict[str, str] = {
    "drink fluids as tolerated": "Beba líquidos según tolere",
    "drink plenty of fluids": "Beba abundante líquido",
    "resume normal diet": "Reanude su dieta habitual",
    "low sodium diet": "Dieta baja en sodio",
    "regular diet as tolerated": "Dieta regular según tolere",
    "no restrictions.": "Sin restricciones.",
    "no restrictions": "Sin restricciones.",
}

SUMMARY_MAP_ES: dict[str, str] = {
    "your instructions include two medicines, follow-up, and warning signs to watch for.": (
        "Sus instrucciones incluyen dos medicamentos, citas de seguimiento y signos de alarma "
        "a los que debe prestar atención."
    ),
    "follow care instructions for wound dressing and medication schedule.": (
        "Siga las instrucciones de cuidado para las curaciones de la herida y el horario "
        "de sus medicamentos."
    ),
    "take medications as prescribed and attend scheduled follow-up visits.": (
        "Tome los medicamentos según lo prescrito y asista a sus visitas de seguimiento "
        "programadas."
    ),
    "you are going home. rest and watch for the warning signs below.": (
        "Usted va a casa. Descanse y preste atención a los signos de alarma que se indican abajo."
    ),
}


def _translate_duration(text: str | None) -> str | None:
    if text is None:
        return None
    cleaned = text.strip()
    lowered = cleaned.lower()

    duration_patterns = [
        (r"\bfor\s+(\d+)\s*days?\b", r"por \1 días"),
        (r"\bfor\s+(\d+)\s*weeks?\b", r"por \1 semanas"),
        (r"\bfor\s+(\d+)\s*months?\b", r"por \1 meses"),
        (r"\bfor\s+(\d+)\s*hours?\b", r"por \1 horas"),
        (r"\b(\d+)\s*days?\b", r"\1 días"),
        (r"\b(\d+)\s*weeks?\b", r"\1 semanas"),
        (r"\b(\d+)\s*months?\b", r"\1 meses"),
        (r"\b(\d+)\s*hours?\b", r"\1 horas"),
    ]
    translated = lowered
    for pattern, repl in duration_patterns:
        translated = re.sub(pattern, repl, translated)

    if translated != lowered:
        return translated
    return f"{cleaned} [en]"


def _translate_timeframe(text: str | None) -> str | None:
    if text is None:
        return None
    cleaned = text.strip()
    lowered = cleaned.lower()

    timeframe_patterns = [
        (r"\bwithin\s+(\d+)\s*days?\b", r"dentro de \1 días"),
        (r"\bwithin\s+(\d+)\s*weeks?\b", r"dentro de \1 semanas"),
        (r"\bwithin\s+(\d+)\s*months?\b", r"dentro de \1 meses"),
        (r"\bin\s+(\d+)\s*days?\b", r"en \1 días"),
        (r"\bin\s+(\d+)\s*weeks?\b", r"en \1 semanas"),
        (r"\bin\s+(\d+)\s*months?\b", r"en \1 meses"),
    ]
    translated = lowered
    for pattern, repl in timeframe_patterns:
        translated = re.sub(pattern, repl, translated)

    if translated != lowered:
        return translated
    return f"{cleaned} [en]"


def _translate_instruction(text: str | None) -> str | None:
    if text is None:
        return None
    cleaned = text.strip()
    lowered = cleaned.lower()

    # Exact standard match without losing specific clinician details
    if lowered in INSTRUCTION_MAP_ES:
        return INSTRUCTION_MAP_ES[lowered]
    # Keep full instruction text intact to avoid clinical omission
    return f"{cleaned} [en]"


def localize_patient_view(view: PatientView, target_lang: Literal["en", "es"]) -> PatientView:
    """Safely localize patient-facing discharge sheet to Spanish or English.

    Preserves exact clinical medication names, numeric doses, and units without alteration.
    Explicitly marks any untranslated text with '[en]' rather than omitting clinical details.
    """
    if target_lang != "es":
        return view.model_copy(update={"language": "en"})

    localized_medications: list[PatientMedicationRow] = []
    for med in view.medications:
        # Route localization
        route_key = med.route.lower().strip() if med.route else None
        if route_key:
            route_es = ROUTE_MAP_ES.get(route_key, f"{med.route} [en]")
        else:
            route_es = None

        # Frequency localization
        freq_key = med.frequency.lower().strip() if med.frequency else None
        if freq_key:
            freq_es = FREQUENCY_MAP_ES.get(freq_key, f"{med.frequency} [en]")
        else:
            freq_es = None

        # Duration localization
        duration_es = _translate_duration(med.duration)

        localized_medications.append(
            PatientMedicationRow(
                name=med.name,  # Clinical drug name kept exact
                dose=med.dose,  # Exact validated dose
                unit=med.unit,  # Exact validated unit
                route=route_es,
                frequency=freq_es,
                duration=duration_es,
            )
        )

    localized_follow_up: list[PatientFollowUp] = []
    for f in view.follow_up:
        localized_follow_up.append(
            PatientFollowUp(
                instruction=_translate_instruction(f.instruction),
                timeframe=_translate_timeframe(f.timeframe),
            )
        )

    localized_warning_signs: list[str] = []
    for sign in view.warning_signs:
        sign_cleaned = sign.strip()
        sign_es = WARNING_SIGNS_MAP_ES.get(sign_cleaned.lower(), f"{sign_cleaned} [en]")
        localized_warning_signs.append(sign_es)

    # Activity & Diet
    if view.activity:
        activity_key = view.activity.strip().lower()
        activity_es = ACTIVITY_MAP_ES.get(activity_key, f"{view.activity} [en]")
    else:
        activity_es = None

    if view.diet:
        diet_key = view.diet.strip().lower()
        diet_es = DIET_MAP_ES.get(diet_key, f"{view.diet} [en]")
    else:
        diet_es = None

    # Summary
    if view.summary:
        summary_key = view.summary.strip().lower()
        summary_es = SUMMARY_MAP_ES.get(summary_key, f"{view.summary} [en]")
    else:
        summary_es = None

    return PatientView(
        case_id=view.case_id,
        revision_id=view.revision_id,
        content_hash=view.content_hash,
        approved_at=view.approved_at,
        provider_mode=view.provider_mode,
        language="es",
        summary=summary_es,
        medications=localized_medications,
        follow_up=localized_follow_up,
        warning_signs=localized_warning_signs,
        activity=activity_es,
        diet=diet_es,
        notice=SPANISH_NOTICE,
    )
