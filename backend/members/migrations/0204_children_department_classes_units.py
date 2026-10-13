from django.db import migrations


def seed_children_department_classes(apps, schema_editor):
    Department = apps.get_model("members", "Department")
    ChildrenGroup = apps.get_model("members", "ChildrenGroup")

    classes_str = "Beginners, Kindergarten, Primary, Junior, Teens, Pathfinders"
    Department.objects.filter(code="children").update(units=classes_str)

    groups_data = (
        ("beginners", "Beginners", 0, 3, 1, "Cradle Roll / Beginners (0–3 yrs)"),
        ("kindergarten", "Kindergarten", 4, 6, 2, "Kindergarten (4–6 yrs)"),
        ("primary", "Primary", 7, 9, 3, "Primary (7–9 yrs)"),
        ("junior", "Junior", 10, 12, 4, "Junior (10–12 yrs)"),
        ("teens", "Teens", 13, 15, 5, "Earliteen / Teens (13–15 yrs)"),
        ("pathfinders", "Pathfinders", 10, 15, 6, "Pathfinder Club (10–15 yrs)"),
    )
    for code, name, min_age, max_age, sort_order, desc in groups_data:
        ChildrenGroup.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "min_age": min_age,
                "max_age": max_age,
                "sort_order": sort_order,
                "description": desc,
            },
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0203_sabbath_school_ministry_and_lesson_orders"),
    ]

    operations = [
        migrations.RunPython(seed_children_department_classes, noop_reverse),
    ]
