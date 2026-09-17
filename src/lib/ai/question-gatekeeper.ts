export interface QuestionFlaw {
  flawType:
    | "TOO_BROAD"
    | "AMBIGUOUS_TERM"
    | "MISSING_CONTEXT"
    | "MISSING_CONSTRAINTS"
    | "MISSING_OBJECTIVE"
    | "MISSING_MEASURABLE_VARIABLES"
    | "MISSING_OPERATING_CONDITIONS"
    | "MISSING_UNITS"
    | "MISSING_TIMEFRAME"
    | "MISSING_SUBSYSTEM"
    | "INSUFFICIENT_EVIDENCE"
    | "MISSING_DECISION_FRAME";
  title: string;
  description: string;
}

export interface ClarificationPrompt {
  id: string;
  question: string;
  options?: string[];
  placeholder?: string;
}

export interface StructuredEngineeringQuestion {
  originalInput: string;
  isWellFormed: boolean;
  flaws: QuestionFlaw[];
  clarificationPrompts: ClarificationPrompt[];
  formalQuestionTemplate: string;
  components: {
    targetSubsystem: string;
    performanceMetric: string;
    quantitativeTarget: string;
    operatingCondition: string;
    constraints: string[];
    availableEvidence: string[];
  };
}

export function inspectAndFormulateQuestion(
  userInput: string,
  subsystemContext: string = "Main Engine Assembly"
): StructuredEngineeringQuestion {
  const flaws: QuestionFlaw[] = [];
  const clarifications: ClarificationPrompt[] = [];
  const lower = userInput.toLowerCase();

  // 1. Detect broad/vague terms ("better", "faster", "reliable", "good", "improve")
  if (/\b(better|faster|reliable|good|improve|optimize|fix|upgrade)\b/i.test(userInput)) {
    flaws.push({
      flawType: "AMBIGUOUS_TERM",
      title: "Undefined Subjective Metric ('better' / 'improve')",
      description:
        "The term 'better' or 'improve' is unquantified. Specify which exact engineering metric (e.g. specific impulse, mass, thermal dissipation) is being targeted.",
    });
    clarifications.push({
      id: "performanceMetric",
      question: "What specific performance metric should be improved?",
      options: ["Specific Impulse (Isp)", "Thrust-to-Weight Ratio", "Dry Mass", "Thermal Soak-back Margin", "Production Cost"],
      placeholder: "e.g., Specific Impulse (Isp)",
    });
  }

  // 2. Check for missing quantitative target & units
  if (!/\d+/.test(userInput)) {
    flaws.push({
      flawType: "MISSING_MEASURABLE_VARIABLES",
      title: "Missing Quantitative Delta & Units",
      description: "No numerical improvement threshold or engineering unit specified (e.g. '+ 3.5%', '< 450 kg').",
    });
    clarifications.push({
      id: "quantitativeTarget",
      question: "What is the baseline value and required quantitative improvement target?",
      placeholder: "e.g., increase Isp by at least 2.5% (from 310s to 317.75s)",
    });
  }

  // 3. Check for missing operating conditions
  if (!/\b(at|under|during|in)\b/i.test(userInput) || (!lower.includes("vacuum") && !lower.includes("sea level") && !lower.includes("altitude") && !lower.includes("temperature"))) {
    flaws.push({
      flawType: "MISSING_OPERATING_CONDITIONS",
      title: "Missing Operating Conditions",
      description: "Engineering analysis depends on operating environment (e.g., Sea Level vs Vacuum, Max Dynamic Pressure, -40°C to +85°C).",
    });
    clarifications.push({
      id: "operatingCondition",
      question: "What operating conditions apply to this evaluation?",
      options: ["Vacuum Operation (Alt > 100km)", "Sea Level Ignition", "Max-Q Dynamic Pressure", "Thermal Extreme Transient"],
      placeholder: "e.g., Vacuum operation at 100% rated thrust",
    });
  }

  // 4. Check for missing constraints
  flaws.push({
    flawType: "MISSING_CONSTRAINTS",
    title: "Unspecified Design & Safety Constraints",
    description: "Must define non-negotiable boundaries (mass ceiling, temperature limits, safety margins, interface freeze).",
  });
  clarifications.push({
    id: "constraints",
    question: "What constraints must remain unchanged or strictly respected?",
    placeholder: "e.g., Mass ceiling of 420 kg, Max chamber temperature 3200 K, envelope < 1.8m diameter",
  });

  const isWellFormed = flaws.length === 0;

  // Construct formal structured template
  const formalQuestionTemplate = `How can ${subsystemContext} improve [Performance Metric] by at least [Quantitative Target] under [Operating Condition] without exceeding [Design & Safety Constraints]?`;

  return {
    originalInput: userInput,
    isWellFormed,
    flaws,
    clarificationPrompts: clarifications,
    formalQuestionTemplate,
    components: {
      targetSubsystem: subsystemContext,
      performanceMetric: "Specific Impulse (Isp)",
      quantitativeTarget: ">= 2.5%",
      operatingCondition: "Vacuum Operation",
      constraints: ["Mass <= 420 kg", "Chamber Temp <= 3200 K"],
      availableEvidence: ["Hot-fire Test Log #TF-104", "FEA Thermal Model Rev B"],
    },
  };
}
