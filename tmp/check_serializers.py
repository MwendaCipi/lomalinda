from members.serializers import (
    PrayerRequestSerializer,
    VisitationRequestSerializer,
    ChildDedicationRequestSerializer,
    MembershipTransferRequestSerializer,
)

cases = [
    ("prayer", PrayerRequestSerializer,
     {"request_text": "Please pray for my family this week.", "audience": "elders", "anonymous": True}),
    ("prayer (named)", PrayerRequestSerializer,
     {"request_text": "Please pray for my family this week.", "audience": "pastor", "anonymous": False, "name": "Mwenda Cipi"}),
    ("visitation", VisitationRequestSerializer,
     {"requester_name": "Mwenda Cipi", "phone_number": "0712345678", "visitation_type": "family",
      "preferred_date": "2026-10-12", "preferred_time": "10:00", "notes": "Bring the elder"}),
    ("dedication", ChildDedicationRequestSerializer,
     {"child_name": "Maria Mwangi", "child_dob": "2026-01-15", "father_name": "Joseph Mwangi",
      "mother_name": "Grace Mwangi", "phone_number": "0712345678", "notes": "Sabbath morning"}),
    ("transfer", MembershipTransferRequestSerializer,
     {"member_name": "Mwenda Cipi", "transfer_type": "incoming", "other_church": "SDA Kiganjo",
      "reason": "Moving to the area", "phone_number": "0712345678"}),
    ("OLD modal visitation (proof of the bug)", VisitationRequestSerializer,
     {"requester_name": "Anonymous", "phone_number": "0000000000", "visitation_type": "home"}),
    ("OLD modal prayer (empty text)", PrayerRequestSerializer,
     {"request_text": "No text provided", "anonymous": False}),
]

for label, ser, data in cases:
    s = ser(data=data, context={})
    ok = s.is_valid()
    verdict = "ACCEPTED" if ok else "REJECTED -> " + str(s.errors)
    print("RESULT %-40s %s" % (label, verdict))
