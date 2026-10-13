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
    "every 12 hours": "cada 12 horas",
    "every 24 hours": "cada 24 horas",
    "at bedtime": "al acostarse",
    "with meals": "con las comidas",
    "before meals": "antes de las comidas",
    "as needed": "según sea necesario",
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
}


def _translate_duration(text: str | None) -> str | None:
    if text is None:
        return None
    cleaned = text.strip()
    lowered = cleaned.lower()

    # Common regex replacements
    duration_patterns = [
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
    return cleaned


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
    ]
    translated = lowered
    for pattern, repl in timeframe_patterns:
        translated = re.sub(pattern, repl, translated)

    if translated != lowered:
        return translated
    return cleaned


def _translate_instruction(text: str | None) -> str | None:
    if text is None:
        return None
    cleaned = text.strip()
    lowered = cleaned.lower()

    if (
        "primary care clinician" in lowered
        or "primary care physician" in lowered
        or "pcp" in lowered
    ):
        return "Consulte o programe una cita con su médico o profesional de atención primaria"
    if "follow-up" in lowered or "follow up" in lowered:
        return "Coordine una cita de seguimiento con su equipo de atención médica"
    return cleaned


def localize_patient_view(view: PatientView, target_lang: Literal["en", "es"]) -> PatientView:
    """Safely localize patient-facing discharge sheet to Spanish or English.

    Preserves exact clinical medication names, numeric doses, and units without alteration.
    """
    if target_lang != "es":
        return view.model_copy(update={"language": "en"})

    localized_medications: list[PatientMedicationRow] = []
    for med in view.medications:
        # Route localization
        route_key = med.route.lower().strip() if med.route else None
        route_es = ROUTE_MAP_ES.get(route_key, med.route) if route_key else None
        # Frequency localization
        freq_key = med.frequency.lower().strip() if med.frequency else None
        freq_es = FREQUENCY_MAP_ES.get(freq_key, med.frequency) if freq_key else None
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
        sign_es = WARNING_SIGNS_MAP_ES.get(sign_cleaned.lower(), sign_cleaned)
        localized_warning_signs.append(sign_es)

    # Activity & Diet
    activity_es = (
        ACTIVITY_MAP_ES.get(view.activity.strip().lower(), view.activity)
        if view.activity
        else None
    )
    diet_es = (
        DIET_MAP_ES.get(view.diet.strip().lower(), view.diet)
        if view.diet
        else None
    )

    # Summary
    summary_es = (
        SUMMARY_MAP_ES.get(view.summary.strip().lower(), view.summary)
        if view.summary
        else None
    )

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
