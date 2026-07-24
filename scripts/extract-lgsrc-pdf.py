#!/usr/bin/env python3
import argparse
import datetime as dt
import hashlib
import io
import json
import re
import sys
import urllib.request

import pdfplumber


DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def slug(value):
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:80] or "activity"


def to_24h(value):
    match = re.match(r"^(\d{1,2}):(\d{2})(AM|PM)$", value.strip(), re.I)
    if not match:
        return ""
    hour = int(match.group(1))
    minute = int(match.group(2))
    ampm = match.group(3).upper()
    if ampm == "PM" and hour != 12:
        hour += 12
    if ampm == "AM" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def parse_time_range(cell):
    compact = re.sub(r"\s+", "", (cell or "").replace("\n", ""))
    match = re.match(r"^(\d{1,2}:\d{2})(AM|PM)-(\d{1,2}:\d{2})(AM|PM)$", compact, re.I)
    if not match:
        return "", ""
    start = f"{match.group(1)}{match.group(2)}"
    end = f"{match.group(3)}{match.group(4)}"
    return to_24h(start), to_24h(end)


def dates_for_day(date_from, date_to, day_name):
    target = DAYS.index(day_name)
    current = date_from
    dates = []
    while current <= date_to:
        # Python weekday is Monday=0; convert to Sunday=0.
        if (current.weekday() + 1) % 7 == target:
            dates.append(current)
        current += dt.timedelta(days=1)
    return dates


def restricted_july_dates(lines):
    joined = " ".join(lines)
    if "*" not in joined:
        return None
    matches = re.findall(r"7/(\d{1,2})", joined)
    if not matches:
        return None
    return {int(day) for day in matches}


def infer_category(title):
    low = title.lower()
    if any(token in low for token in ["swim", "water", "aqua"]):
        return "Aquatics"
    if any(token in low for token in ["yoga", "yin", "restorative"]):
        return "Yoga"
    if "cycle" in low or "cycling" in low:
        return "Cycling"
    if "pilates" in low:
        return "Pilates"
    if any(token in low for token in ["zumba", "hip hop", "beats"]):
        return "Dance"
    if any(token in low for token in ["strength", "sculpt", "barre", "conditioning", "tough"]):
        return "Strength"
    return "Group Fitness"


def extract(url, date_from, date_to):
    with urllib.request.urlopen(url, timeout=30) as response:
        pdf_bytes = response.read()

    activities = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                if not table or table[0][:8] != ["Time", *DAYS]:
                    continue
                for row in table[1:]:
                    start_time, end_time = parse_time_range(row[0])
                    if not start_time:
                        continue
                    for index, day_name in enumerate(DAYS, start=1):
                        raw_cell = (row[index] or "").strip()
                        if not raw_cell:
                            continue
                        lines = [line.strip() for line in raw_cell.splitlines() if line.strip()]
                        if not lines:
                            continue
                        title = lines[0]
                        instructor = ""
                        location = ""
                        meta_lines = []
                        for line in lines[1:]:
                            if line.startswith("*"):
                                meta_lines.append(line)
                            elif not instructor:
                                instructor = line
                            else:
                                location = " ".join([location, line]).strip()
                        restricted_days = restricted_july_dates(lines)
                        for date in dates_for_day(date_from, date_to, day_name):
                            if restricted_days and date.day not in restricted_days:
                                continue
                            base = f"lgsrc-{date.isoformat()}-{start_time}-{day_name}-{title}-{instructor}"
                            digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:10]
                            activities.append(
                                {
                                    "id": f"lgsrc-{date.isoformat()}-{slug(title)}-{digest}",
                                    "title": title,
                                    "date": date.isoformat(),
                                    "startTime": start_time,
                                    "endTime": end_time,
                                    "category": infer_category(title),
                                    "instructor": instructor,
                                    "location": location,
                                    "description": " ".join(meta_lines),
                                }
                            )
    return activities


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--date-from", required=True)
    parser.add_argument("--date-to", required=True)
    args = parser.parse_args()

    date_from = dt.date.fromisoformat(args.date_from)
    date_to = dt.date.fromisoformat(args.date_to)
    json.dump(extract(args.url, date_from, date_to), sys.stdout)


if __name__ == "__main__":
    main()
