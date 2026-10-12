# Writing MHUB practice sets

Each new set is one file in `bank/sets/<section>-<short-slug>.json`, then run `python3 bank/build_bank.py` to rebuild `questions.json`.

## Shape
{"id": "<section>-<slug>", "section": "bb|cp|ps|cars", "title": "...", "topic": "<exact Kaplan chapter name, or 'CARS - Humanities' / 'CARS - Social science' / 'CARS - Natural science' / 'CARS - Philosophy / ethics'>", "minutes": 9,
 "passage": ["paragraph", {"table": {"caption": "Table 1 ...", "head": ["..."], "rows": [["..."]]}}, "paragraph"],
 "questions": [{"stem": "...", "choices": ["A","B","C","D"], "answer": 0-3, "skill": "Concept application|Research design|Data interpretation|Foundations of comprehension|Reasoning within the text|Reasoning beyond the text", "why": ["why A is right/wrong", "...B", "...C", "...D"], "trap": "named trap of the most tempting wrong answer", "rule": "one-line heuristic"}]}

## Standards
- 100% original. Never copy, paraphrase or reconstruct AAMC, UWorld or other commercial questions. Do not use the words AAMC or "official" anywhere in sets.
- Science passages: 250-400 words describing a study (rationale, methods, results) with a table or clearly described figure. 5 questions: about 2 data/research-design, 2 concept application, 1 recall-in-context.
- CARS: 450-600 words of argumentative humanities/social-science prose with a clear author voice and at least one opposing view. 5 questions: main idea, tone, detail with a hedge/extreme-wording trap, new information, function of a paragraph or example.
- Wrong answers must be tempting for a specific, nameable reason: true but unsupported, extreme qualifier, reversed direction, right concept wrong variable, outcome vs mechanism, correlation as causation, out of scope.
- Verify every fact and every calculation. If a number is computed, show it in the right answer's "why".
- Balance answer letters across the set; keep numeric choices in ascending order.
