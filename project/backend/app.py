"""
Smart Placement Cell Portal — Flask Backend
AI Resume & Eligibility System

Routes:
  POST /upload      — accept resume PDF, extract text
  POST /analyze     — parse skills, compare with company data, return match %
  GET  /companies   — return company catalog
  GET  /matches     — return computed matches for a student

Run:  python app.py  (then http://localhost:5000)
"""

import os
import re
import io
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow the frontend (Vite dev server) to call this API

# ---------------------------------------------------------------------------
# Company data (in a real product this would live in Supabase; mirrored here
# so the matching engine has fast access without a round-trip per request)
# ---------------------------------------------------------------------------
COMPANIES = [
    {
        "id": "c1", "name": "Nimbus Labs", "role": "Frontend Engineer",
        "package_lpa": 18.0, "color": "#4f46e5", "tier": "Tier 1", "openings": 6,
        "required_skills": ["React", "JavaScript", "CSS", "HTML", "TypeScript"],
        "min_cgpa": 7.0, "required_branches": ["CSE", "IT", "ECE"],
    },
    {
        "id": "c2", "name": "Quanta Cloud", "role": "Cloud Backend Engineer",
        "package_lpa": 22.0, "color": "#06b6d4", "tier": "Tier 1", "openings": 9,
        "required_skills": ["Python", "AWS", "Docker", "PostgreSQL", "REST"],
        "min_cgpa": 7.5, "required_branches": ["CSE", "IT"],
    },
    {
        "id": "c3", "name": "Vertex AI", "role": "ML Engineer",
        "package_lpa": 26.0, "color": "#10b981", "tier": "Tier 1", "openings": 4,
        "required_skills": ["Python", "TensorFlow", "Machine Learning", "Statistics", "NLP"],
        "min_cgpa": 8.0, "required_branches": ["CSE", "IT", "ECE", "AI"],
    },
    {
        "id": "c4", "name": "Lumen Pay", "role": "Payments SDE",
        "package_lpa": 16.0, "color": "#f59e0b", "tier": "Tier 2", "openings": 3,
        "required_skills": ["Java", "Spring", "SQL", "Microservices", "Kafka"],
        "min_cgpa": 7.0, "required_branches": ["CSE", "IT"],
    },
    {
        "id": "c5", "name": "Drift Studio", "role": "Product Designer",
        "package_lpa": 14.0, "color": "#ec4899", "tier": "Tier 2", "openings": 2,
        "required_skills": ["Figma", "UI/UX", "Prototyping", "Research", "Design Systems"],
        "min_cgpa": 6.5, "required_branches": ["CSE", "IT", "Design"],
    },
    {
        "id": "c6", "name": "Forge Systems", "role": "DevOps Engineer",
        "package_lpa": 19.0, "color": "#8b5cf6", "tier": "Tier 2", "openings": 5,
        "required_skills": ["Docker", "Kubernetes", "CI/CD", "Linux", "Terraform"],
        "min_cgpa": 7.0, "required_branches": ["CSE", "IT", "ECE"],
    },
    {
        "id": "c7", "name": "Cobalt HR", "role": "Data Analyst",
        "package_lpa": 12.0, "color": "#ef4444", "tier": "Tier 3", "openings": 1,
        "required_skills": ["SQL", "Python", "Tableau", "Excel", "Statistics"],
        "min_cgpa": 6.5, "required_branches": ["CSE", "IT", "ECE", "EEE"],
    },
]

# Skill keyword bank used for resume parsing (case-insensitive substring match)
SKILL_DB = [
    "React", "JavaScript", "TypeScript", "Python", "Java", "SQL", "AWS", "Docker",
    "Kubernetes", "Machine Learning", "TensorFlow", "CSS", "HTML", "Node", "PostgreSQL",
    "MongoDB", "Git", "Figma", "REST", "GraphQL", "Spring", "Kafka", "Tableau",
    "Excel", "Statistics", "NLP", "Linux", "CI/CD", "Terraform", "Microservices",
    "UI/UX", "Prototyping", "Research", "Design Systems",
]


# ---------------------------------------------------------------------------
# Resume text extraction
# ---------------------------------------------------------------------------
def extract_text_from_pdf(file_stream):
    """Extract plain text from an uploaded PDF using PyPDF2."""
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(file_stream)
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
        return text.strip()
    except Exception:
        # PyPDF2 not installed — return empty so the caller falls back
        return ""


def parse_skills(text):
    """Return the list of known skills found in the text (case-insensitive)."""
    lower = text.lower()
    found = []
    for skill in SKILL_DB:
        if skill.lower() in lower:
            found.append(skill)
    return found


def extract_cgpa(text):
    """Best-effort CGPA extraction from resume text."""
    match = re.search(r"(?:CGPA|CPI|GPA)[:\s]+([0-9]+\.?[0-9]*)", text, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass
    return None


def extract_branch(text):
    """Best-effort branch extraction."""
    branches = ["CSE", "Computer Science", "IT", "Information Technology",
                "ECE", "EEE", "Electrical", "Mechanical", "AI", "Artificial Intelligence"]
    lower = text.lower()
    for b in branches:
        if b.lower() in lower:
            if b in ("Computer Science", "Information Technology", "Artificial Intelligence"):
                return {"Computer Science": "CSE", "Information Technology": "IT",
                        "Artificial Intelligence": "AI"}[b]
            return b
    return None


# ---------------------------------------------------------------------------
# Matching engine
# ---------------------------------------------------------------------------
def compute_match(student, company):
    """
    Compare a student profile against a company requirement and return:
      - match_score (0-100)
      - matched_skills, missing_skills
      - eligible (bool)
      - reasoning (string)
    Weights: skills 60%, CGPA 20%, branch 20%.
    """
    student_skills = set(s.lower() for s in student.get("skills", []))
    required = set(s.lower() for s in company["required_skills"])
    matched = student_skills & required
    missing = required - student_skills

    skill_ratio = len(matched) / len(required) if required else 0
    skill_score = skill_ratio * 60

    cgpa = student.get("cgpa") or 0
    cgpa_score = 20 if cgpa >= company["min_cgpa"] else (cgpa / company["min_cgpa"]) * 20

    branch = student.get("branch") or ""
    branch_score = 20 if branch in company["required_branches"] else 0

    total = round(skill_score + cgpa_score + branch_score)
    eligible = cgpa >= company["min_cgpa"] and branch in company["required_branches"] and skill_ratio >= 0.4

    matched_names = [s for s in company["required_skills"] if s.lower() in matched]
    missing_names = [s for s in company["required_skills"] if s.lower() in missing]

    reasoning = (
        f"{len(matched_names)}/{len(required)} skills matched"
        + (f", CGPA {cgpa} meets minimum {company['min_cgpa']}" if cgpa >= company["min_cgpa"] else f", CGPA {cgpa} below minimum {company['min_cgpa']}")
        + (", branch eligible" if branch in company["required_branches"] else ", branch not eligible")
    )

    return {
        "match_score": total,
        "matched_skills": matched_names,
        "missing_skills": missing_names,
        "eligible": eligible,
        "reasoning": reasoning,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return jsonify({"service": "Smart Placement Cell API", "status": "running"})


@app.route("/companies", methods=["GET"])
def get_companies():
    """Return the full company catalog."""
    return jsonify(COMPANIES)


@app.route("/upload", methods=["POST"])
def upload_resume():
    """Accept a resume PDF and return the extracted text + detected skills."""
    if "resume" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["resume"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported"}), 400

    text = extract_text_from_pdf(io.BytesIO(file.read()))
    skills = parse_skills(text)
    cgpa = extract_cgpa(text)
    branch = extract_branch(text)

    return jsonify({
        "filename": file.filename,
        "text_length": len(text),
        "skills": skills,
        "cgpa": cgpa,
        "branch": branch,
        "preview": text[:500],
    })


@app.route("/analyze", methods=["POST"])
def analyze_resume():
    """
    Accept a resume PDF (multipart) OR a JSON profile {skills, cgpa, branch},
    parse it, and return match scores against every company.
    """
    student = {}

    if request.content_type and "multipart" in request.content_type and "resume" in request.files:
        file = request.files["resume"]
        text = extract_text_from_pdf(io.BytesIO(file.read()))
        student["skills"] = parse_skills(text)
        student["cgpa"] = extract_cgpa(text) or 0
        student["branch"] = extract_branch(text) or ""
        student["filename"] = file.filename
    else:
        body = request.get_json(silent=True) or {}
        student["skills"] = body.get("skills", [])
        student["cgpa"] = body.get("cgpa", 0)
        student["branch"] = body.get("branch", "")

    if not student.get("skills"):
        return jsonify({"error": "No skills detected in input"}), 400

    matches = []
    for company in COMPANIES:
        m = compute_match(student, company)
        matches.append({
            "id": company["id"],
            "name": company["name"],
            "role": company["role"],
            "package_lpa": company["package_lpa"],
            "color": company["color"],
            "tier": company["tier"],
            "openings": company["openings"],
            "match": m["match_score"],
            "matched_skills": m["matched_skills"],
            "missing_skills": m["missing_skills"],
            "eligible": m["eligible"],
            "reasoning": m["reasoning"],
            "why": m["reasoning"],
        })

    matches.sort(key=lambda x: x["match"], reverse=True)
    avg = round(sum(m["match"] for m in matches) / len(matches)) if matches else 0

    return jsonify({
        "skills": student["skills"],
        "cgpa": student.get("cgpa", 0),
        "branch": student.get("branch", ""),
        "score": min(95, 40 + len(student["skills"]) * 5),
        "eligibility": len(student["skills"]) >= 3,
        "avg_match": avg,
        "matches": matches,
    })


@app.route("/matches", methods=["GET"])
def get_matches():
    """
    Return computed matches for a student. Accepts skills/cgpa/branch as query
    params (e.g. /matches?skills=React,Python&cgpa=8.5&branch=CSE) so the
    frontend can fetch matches without uploading a file each time.
    """
    skills_raw = request.args.get("skills", "")
    student = {
        "skills": [s.strip() for s in skills_raw.split(",") if s.strip()],
        "cgpa": float(request.args.get("cgpa", 0) or 0),
        "branch": request.args.get("branch", ""),
    }
    matches = []
    for company in COMPANIES:
        m = compute_match(student, company)
        matches.append({
            "id": company["id"], "name": company["name"], "role": company["role"],
            "package_lpa": company["package_lpa"], "color": company["color"],
            "tier": company["tier"], "openings": company["openings"],
            "match": m["match_score"], "missing": m["missing_skills"],
            "eligible": m["eligible"], "why": m["reasoning"],
        })
    matches.sort(key=lambda x: x["match"], reverse=True)
    return jsonify(matches)


# ---------------------------------------------------------------------------
# Serve the frontend (optional — handy for a single-port deployment)
# ---------------------------------------------------------------------------
@app.route("/frontend/<path:path>")
def serve_frontend(path):
    return send_from_directory("../frontend", path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
