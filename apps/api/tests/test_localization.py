from datetime import UTC, datetime

from app.schemas.domain import PatientFollowUp, PatientMedicationRow, PatientView
from app.services.localization import localize_patient_view


def _view() -> PatientView:
    return PatientView(
        case_id="c",
        revision_id="r",
        content_hash="h",
        approved_at=datetime.now(UTC),
        provider_mode="openai_compatible",
        summary="You were seen in the emergency department for a cough.",
        medications=[
            PatientMedicationRow(
                name="Albuterol inhaler",
                dose="2",
                unit="puffs",
                route="by inhalation",
                frequency="every 4 hours as needed for wheezing",
                duration="7 days",
            ),
            PatientMedicationRow(
                name="Ibuprofen",
                dose="400",
                unit="mg",
                route="by mouth",
                frequency="every 8 hours with food as needed",
                duration="3 days",
            ),
        ],
        follow_up=[
            PatientFollowUp(
                instruction="See your primary care clinician if the cough is not improving.",
                timeframe="within 3 days",
            )
        ],
        warning_signs=["Coughing up blood", "Fever above 39 C"],
        activity="Rest and avoid smoke exposure.",
        diet="Drink plenty of fluids.",
        notice="n",
    )


def test_emergency_discharge_phrases_translate_and_keep_clinical_values() -> None:
    view = localize_patient_view(_view(), "es")
    albuterol, ibuprofen = view.medications
    assert (albuterol.name, albuterol.dose, albuterol.unit) == ("Albuterol inhaler", "2", "puffs")
    assert albuterol.route == "por inhalación"
    assert albuterol.frequency == "cada 4 horas según sea necesario para las sibilancias"
    assert albuterol.duration == "7 días"
    assert ibuprofen.frequency == "cada 8 horas con alimentos según sea necesario"
    assert view.follow_up[0].instruction == (
        "Consulte a su médico de atención primaria si la tos no mejora."
    )
    assert view.warning_signs == ["Tos con sangre", "Fiebre mayor de 39 °C"]
    assert view.activity == "Descanse y evite la exposición al humo."


def test_untranslated_text_stays_flagged() -> None:
    view = localize_patient_view(_view(), "es")
    assert view.summary is not None and view.summary.endswith("[en]")
