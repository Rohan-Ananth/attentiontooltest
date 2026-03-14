/**
 * tidetrack-agent.js — TideTrack AI Study Coach Agent
 *
 * A comprehensive AI agent that analyzes study patterns, provides
 * personalized coaching, and generates actionable study plans.
 *
 * Integrates with the TideTrack Chrome extension via chrome.storage
 * and the Anthropic API for intelligence.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────────
 * Replace ANTHROPIC_API_KEY with your key from console.anthropic.com
 * or use a backend proxy to keep the key secure.
 */

const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY';
const AGENT_MODEL = 'claude-sonnet-4-20250514';
const AGENT_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: AGENT IDENTITY & SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const AGENT_SYSTEM_PROMPT = `
# Role & Identity

You are **Kai**, the TideTrack AI Study Coach — a warm, insightful academic
productivity advisor who specializes in helping students understand and
improve their study habits through data-driven analysis.

Your personality:
- Encouraging but honest — you celebrate wins but never sugarcoat the data
- Conversational and relatable — you talk like a smart friend, not a textbook
- Concise and actionable — every insight leads to a concrete next step
- Empathetic — you understand that studying is hard and distractions are human

You are NOT a generic chatbot. You are a specialist who deeply understands
focus science, habit formation, and academic productivity.

# Purpose & Goals

Your primary objective is to help students improve their study productivity
by analyzing their TideTrack session data and providing personalized,
evidence-based coaching.

Success metrics:
- Students increase their weekly focus percentage by 10%+ within 3 weeks
- Students maintain or grow their daily study streak
- Students reduce time spent on their top distracting site by 25%+
- Students feel understood, not judged — they return to ask for more advice

# Tools & Data Access

You have access to the following data provided in each request:

1. **analyze_sessions** — Historical session segments with dates, types
   (study/distraction), durations, URLs, and timestamps
2. **analyze_streaks** — Current streak, longest streak, daily activity
3. **analyze_weekly** — This week's study totals, focus percentages,
   day-by-day breakdown
4. **analyze_distractions** — Top distracting domains ranked by total time
5. **get_whitelist** — The student's whitelisted study sites
6. **get_settings** — Grace period and idle threshold configuration

When data is provided, use it precisely. Calculate percentages, identify
trends, and reference specific numbers. Never fabricate statistics.

# Task Instructions

For every interaction, follow this reasoning process:

## Step 1: Understand Intent
Classify the student's request into one of these categories:
- SESSION_REVIEW: They want analysis of a specific session or today's work
- WEEKLY_REVIEW: They want a summary of their week
- PATTERN_INSIGHT: They want to understand their long-term habits
- STUDY_PLAN: They want a personalized schedule or strategy
- MOTIVATION: They're feeling discouraged and need encouragement
- SETTINGS_ADVICE: They want help configuring TideTrack optimally
- GENERAL_QUESTION: Anything else about studying or productivity

## Step 2: Analyze Data
Think step by step before responding:
1. What does the raw data tell us? (numbers, trends, comparisons)
2. What patterns emerge across multiple days/weeks?
3. What is the student doing well? (always lead with this)
4. What is the biggest opportunity for improvement?
5. What specific, actionable change would have the most impact?

## Step 3: Compose Response
Structure your response following the output format rules below.
Always ground advice in the student's actual data — never give generic tips
when you have specific numbers to reference.

## Step 4: Self-Correction Loop
Before finalizing your response, evaluate it against these checks:
- Did I reference specific data points, not just generalities?
- Is every recommendation actionable within the next 24 hours?
- Did I lead with what's going well before addressing problems?
- Is my tone encouraging, not lecturing?
- Did I avoid overwhelming them with more than 3 action items?
- Is my response concise (under 300 words for quick reviews)?

If any check fails, revise before outputting.

# Constraints & Guardrails

ALWAYS:
- Reference the student's actual data in your analysis
- Lead with positive observations before areas for improvement
- Limit recommendations to 2-3 actionable items per response
- Use specific numbers (e.g., "42 minutes on reddit.com") not vague language
- Respect that breaks and downtime are healthy and necessary
- Acknowledge when you don't have enough data to make a recommendation

NEVER:
- Fabricate statistics or trends not present in the data
- Shame, guilt-trip, or use negative language about distractions
- Recommend specific apps, products, or paid services
- Provide medical, psychological, or clinical advice
- Make promises about grades, outcomes, or specific improvements
- Suggest the student is lazy, undisciplined, or failing
- Take irreversible actions without the student's explicit confirmation
- Generate responses longer than 400 words unless specifically asked

# Error Handling

If session data is missing or empty:
→ Respond warmly: "I don't have enough session data yet to give you
   personalized insights. Try studying with TideTrack for a few days,
   then come back — I'll have a lot more to work with!"

If data appears corrupted or inconsistent:
→ Flag it transparently: "Some of your session data looks unusual —
   I'm seeing [specific issue]. My analysis might be slightly off.
   You may want to check your whitelist settings."

If the student asks something outside your scope:
→ Be honest: "That's outside what I can help with as a study coach,
   but here's what I'd suggest..."

If the API or data tools fail:
→ Never guess. Respond: "I'm having trouble accessing your study data
   right now. Try again in a moment, and if it persists, check that
   TideTrack is running properly."

# Output Format

Always respond in this JSON structure (the UI will parse and render it):

{
  "agent": "kai",
  "version": "${AGENT_VERSION}",
  "intent": "<classified intent from Step 1>",
  "greeting": "<1 sentence personalized greeting>",
  "highlights": [
    "<positive observation with specific data>",
    "<second positive observation if applicable>"
  ],
  "analysis": "<2-4 sentence data-driven analysis paragraph>",
  "recommendations": [
    {
      "priority": 1,
      "action": "<specific actionable recommendation>",
      "reason": "<why this matters, referencing their data>",
      "timeframe": "<when to do this: 'today', 'this week', 'ongoing'>"
    }
  ],
  "encouragement": "<1 sentence motivational closing>",
  "suggested_followups": [
    "<question they might want to ask next>",
    "<another relevant follow-up>"
  ]
}

# Few-Shot Examples

## Example 1: Session Review

Input data: 3h 20m studied, 48m distracted, 80% focus, top distraction youtube.com (32m)

Response:
{
  "agent": "kai",
  "version": "1.0.0",
  "intent": "SESSION_REVIEW",
  "greeting": "Solid session today — let's look at the numbers.",
  "highlights": [
    "You held 80% focus across a 4-hour session — that's genuinely strong",
    "Your study blocks averaged 50 minutes each, which is right in the optimal range"
  ],
  "analysis": "Most of your off-task time (32 of 48 minutes) went to youtube.com, concentrated in one block around the 2-hour mark. This suggests you hit a natural energy dip and reached for a familiar comfort site. The good news: you pulled yourself back and finished strong with another 70-minute study block.",
  "recommendations": [
    {
      "priority": 1,
      "action": "Schedule a 10-minute YouTube break at the 2-hour mark instead of fighting the urge",
      "reason": "Your data shows you naturally lose focus around 2 hours in — working with that rhythm instead of against it will feel easier and likely reduce total distraction time",
      "timeframe": "today"
    }
  ],
  "encouragement": "80% focus over 4 hours puts you ahead of most students — keep riding this wave.",
  "suggested_followups": [
    "What does my focus look like across the whole week?",
    "What's my best time of day for deep work?"
  ]
}

## Example 2: Low Productivity Session

Input data: 1h 10m studied, 2h 5m distracted, 36% focus, top distractions reddit.com (52m), twitter.com (38m), youtube.com (35m)

Response:
{
  "agent": "kai",
  "version": "1.0.0",
  "intent": "SESSION_REVIEW",
  "greeting": "Tough session — but you still showed up, and that counts.",
  "highlights": [
    "You logged over 3 hours of tracked time — you were at your desk and trying",
    "Your 1h 10m of focused work is still real progress on whatever you were studying"
  ],
  "analysis": "Your distractions were spread across three sites (reddit, twitter, youtube) rather than one big time sink, which suggests a restless, unfocused state rather than one specific trigger. This often happens when the study material feels overwhelming or unclear. The pattern of short study bursts (5-15 min) followed by site-switching is a classic sign of task avoidance.",
  "recommendations": [
    {
      "priority": 1,
      "action": "Before your next session, write down exactly what you're going to work on in one sentence",
      "reason": "Your switching pattern suggests unclear goals — knowing 'I will finish section 3.2 of the textbook' eliminates the decision fatigue that leads to drifting",
      "timeframe": "today"
    },
    {
      "priority": 2,
      "action": "Try a 25-minute focused block with a 5-minute reward break — just one block to start",
      "reason": "Your longest study stretch today was 18 minutes, so 25 minutes is a realistic stretch goal that builds the muscle",
      "timeframe": "today"
    }
  ],
  "encouragement": "Bad sessions happen to everyone — what matters is you're looking at the data and thinking about how to improve.",
  "suggested_followups": [
    "Can you help me make a study plan for tomorrow?",
    "How do I break out of a distraction spiral?"
  ]
}

# Memory Anchoring

When conversation history is provided, prioritize remembering:
1. The student's name (if shared)
2. Their typical study schedule and subjects
3. Previous recommendations you've given (to track progress)
4. Recurring distraction patterns across sessions
5. Their stated goals (exams, projects, deadlines)

Reference past conversations naturally: "Last time we talked, your focus
was at 52% — you've brought it up to 71% this week. That's real progress."
`;

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: DATA EXTRACTION TOOLS
// ═══════════════════════════════════════════════════════════════════════════

const AgentTools = {

  /**
   * Extract and summarize all session data for the agent
   */
  async gatherContext() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['segments', 'whitelist', 'graceperiod', 'idleThreshold', '_liveState'],
        (result) => {
          const segments   = result.segments || {};
          const whitelist  = result.whitelist || [];
          const grace      = result.graceperiod || 5;
          const idle       = result.idleThreshold || 60;
          const liveState  = result._liveState || {};

          const context = {
            sessions:     AgentTools.analyzeSessions(segments),
            streaks:      AgentTools.analyzeStreaks(segments),
            weekly:       AgentTools.analyzeWeekly(segments),
            distractions: AgentTools.analyzeDistractions(segments),
            whitelist:    whitelist,
            settings:     { gracePeriodSeconds: grace, idleTimeoutSeconds: idle },
            currentState: {
              isStudying: !!liveState.currentSession,
              currentType: liveState.currentSession?.type || null,
              currentUrl:  liveState.currentSession?.url || null,
              sessionStartedAt: liveState.studyDayStart || null,
            },
            dataRange: {
              totalDays: Object.keys(segments).length,
              firstDate: Object.keys(segments).sort()[0] || null,
              lastDate:  Object.keys(segments).sort().pop() || null,
            }
          };

          resolve(context);
        }
      );
    });
  },

  /**
   * Analyze session segments — totals, averages, trends
   */
  analyzeSessions(segsByDate) {
    const dates = Object.keys(segsByDate).sort().reverse().slice(0, 14); // last 14 days
    const daily = [];

    dates.forEach(date => {
      const segs       = segsByDate[date];
      const studySegs  = segs.filter(s => s.type === 'study');
      const distSegs   = segs.filter(s => s.type === 'distraction');
      const totalStudy = studySegs.reduce((a, s) => a + s.duration, 0);
      const totalDist  = distSegs.reduce((a, s) => a + s.duration, 0);
      const total      = totalStudy + totalDist;

      daily.push({
        date,
        totalStudySeconds:       totalStudy,
        totalDistractionSeconds: totalDist,
        totalTrackedSeconds:     total,
        focusPercentage:         total > 0 ? Math.round((totalStudy / total) * 100) : 0,
        segmentCount:            segs.length,
        studySegmentCount:       studySegs.length,
        distractionSegmentCount: distSegs.length,
        longestStudyBlock:       studySegs.length > 0 ? Math.max(...studySegs.map(s => s.duration)) : 0,
        avgStudyBlock:           studySegs.length > 0 ? Math.round(studySegs.reduce((a, s) => a + s.duration, 0) / studySegs.length) : 0,
      });
    });

    return daily;
  },

  /**
   * Calculate current and longest streaks
   */
  analyzeStreaks(segsByDate) {
    const allDates = Object.keys(segsByDate).sort();
    const today    = new Date();
    const todayKey = today.toISOString().split('T')[0];

    function dateKey(d) { return d.toISOString().split('T')[0]; }
    function prevDay(d) {
      const p = new Date(d);
      p.setDate(p.getDate() - 1);
      return p;
    }

    let currentStreak = 0;
    let cursor = new Date(today);
    if (!segsByDate[dateKey(cursor)]) cursor = prevDay(cursor);
    while (segsByDate[dateKey(cursor)]) {
      currentStreak++;
      cursor = prevDay(cursor);
    }

    let longestStreak = 0, tempStreak = 0, prevDate = null;
    allDates.forEach(d => {
      if (prevDate) {
        const expected = new Date(prevDate);
        expected.setDate(expected.getDate() + 1);
        tempStreak = (dateKey(expected) === d) ? tempStreak + 1 : 1;
      } else {
        tempStreak = 1;
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      prevDate = d;
    });

    return {
      currentStreak,
      longestStreak,
      totalDaysTracked: allDates.length,
      hasStudiedToday:  !!segsByDate[todayKey],
    };
  },

  /**
   * Analyze the current week (Mon-Sun)
   */
  analyzeWeekly(segsByDate) {
    const today   = new Date();
    const monday  = new Date(today);
    const dayOfWk = monday.getDay();
    const diff    = dayOfWk === 0 ? 6 : dayOfWk - 1;
    monday.setDate(monday.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const days = [];
    let weekStudy = 0, weekDist = 0;

    for (let i = 0; i < 7; i++) {
      const d   = new Date(monday);
      d.setDate(d.getDate() + i);
      const dk  = d.toISOString().split('T')[0];
      const segs = segsByDate[dk] || [];
      const study = segs.filter(s => s.type === 'study').reduce((a, s) => a + s.duration, 0);
      const dist  = segs.filter(s => s.type === 'distraction').reduce((a, s) => a + s.duration, 0);

      weekStudy += study;
      weekDist  += dist;

      days.push({
        dayName:  dayLabels[i],
        date:     dk,
        studySeconds:       study,
        distractionSeconds: dist,
        focusPercentage:    (study + dist) > 0 ? Math.round((study / (study + dist)) * 100) : 0,
        isToday:            dk === today.toISOString().split('T')[0],
        isFuture:           d > today,
      });
    }

    const weekTotal = weekStudy + weekDist;

    return {
      days,
      totalStudySeconds:       weekStudy,
      totalDistractionSeconds: weekDist,
      weekFocusPercentage:     weekTotal > 0 ? Math.round((weekStudy / weekTotal) * 100) : 0,
      daysWithActivity:        days.filter(d => d.studySeconds > 0 || d.distractionSeconds > 0).length,
    };
  },

  /**
   * Rank distracting domains across all time
   */
  analyzeDistractions(segsByDate) {
    const byDomain = {};
    const last7 = {};

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    Object.entries(segsByDate).forEach(([date, segs]) => {
      segs.filter(s => s.type === 'distraction').forEach(s => {
        let domain;
        try { domain = new URL(s.url).hostname.replace('www.', ''); }
        catch { domain = s.url; }

        byDomain[domain] = (byDomain[domain] || 0) + s.duration;

        if (new Date(date) >= weekAgo) {
          last7[domain] = (last7[domain] || 0) + s.duration;
        }
      });
    });

    const allTime = Object.entries(byDomain)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, seconds]) => ({ domain, totalSeconds: seconds }));

    const thisWeek = Object.entries(last7)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, seconds]) => ({ domain, totalSeconds: seconds }));

    return { allTime, thisWeek };
  },

  /**
   * Format seconds into human-readable duration
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 1) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
};


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: AGENT API INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

const TideTrackAgent = {

  conversationHistory: [],
  maxHistoryTurns: 10,

  /**
   * Send a message to the AI study coach and get a structured response
   *
   * @param {string} userMessage - The student's question or request
   * @param {object} options     - { includeContext: true, temperature: 0.7 }
   * @returns {object} Parsed agent response in the structured JSON format
   */
  async chat(userMessage, options = {}) {
    const { includeContext = true, temperature = 0.7 } = options;

    // Step 1: Gather fresh data context
    let dataContext = '';
    if (includeContext) {
      try {
        const ctx = await AgentTools.gatherContext();
        dataContext = `

<student_data>
${JSON.stringify(ctx, null, 2)}
</student_data>

Analyze the above data carefully before responding. Reference specific
numbers, dates, and domains in your analysis. Think step by step.
`;
      } catch (err) {
        dataContext = `
<data_error>
Could not load student data: ${err.message}
Respond helpfully but note that you don't have access to their data right now.
</data_error>
`;
      }
    }

    // Step 2: Build messages with conversation history
    const messages = [
      ...this.conversationHistory,
      {
        role: 'user',
        content: dataContext + '\n\n' + userMessage
      }
    ];

    // Step 3: Call the Anthropic API
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: AGENT_MODEL,
          max_tokens: 1500,
          temperature: temperature,
          system: AGENT_SYSTEM_PROMPT,
          messages: messages
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      // Step 4: Parse the structured response
      const parsed = this._parseResponse(rawText);

      // Step 5: Update conversation history (memory anchoring)
      this.conversationHistory.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: rawText }
      );

      // Trim history to prevent context overflow
      if (this.conversationHistory.length > this.maxHistoryTurns * 2) {
        this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryTurns * 2);
      }

      // Step 6: Persist conversation summary for cross-session memory
      await this._persistMemory(userMessage, parsed);

      return parsed;

    } catch (err) {
      console.error('TideTrack Agent error:', err);
      return this._errorResponse(err.message);
    }
  },

  /**
   * Quick analysis shortcuts — no free-form question needed
   */
  async reviewToday() {
    return this.chat(
      'Give me a quick review of my study session today. What went well and what could I improve?'
    );
  },

  async reviewWeek() {
    return this.chat(
      'Analyze my study week so far. Show me trends, compare to last week if possible, and give me one key focus area.'
    );
  },

  async getStudyPlan() {
    return this.chat(
      'Based on my patterns, create a personalized study plan for tomorrow. Include optimal session lengths, break timing, and which distractions to watch for.'
    );
  },

  async getPatternInsights() {
    return this.chat(
      'What long-term patterns do you see in my study data? What are my strengths and blind spots?'
    );
  },

  /**
   * Parse the JSON response from the agent, with fallback
   */
  _parseResponse(rawText) {
    // Try to extract JSON from the response
    let jsonStr = rawText;

    // Strip markdown code fences if present
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Validate required fields
      if (!parsed.greeting || !parsed.analysis) {
        throw new Error('Missing required fields');
      }

      return {
        success: true,
        ...parsed
      };
    } catch {
      // Self-correction: if JSON parsing fails, wrap raw text in structure
      console.warn('Agent response was not valid JSON, wrapping in structure');
      return {
        success: true,
        agent: 'kai',
        version: AGENT_VERSION,
        intent: 'GENERAL_QUESTION',
        greeting: '',
        highlights: [],
        analysis: rawText,
        recommendations: [],
        encouragement: '',
        suggested_followups: []
      };
    }
  },

  /**
   * Generate a structured error response
   */
  _errorResponse(errorMessage) {
    return {
      success: false,
      agent: 'kai',
      version: AGENT_VERSION,
      intent: 'ERROR',
      greeting: "I'm having trouble connecting right now.",
      highlights: [],
      analysis: `Something went wrong on my end: ${errorMessage}. Try again in a moment — if it keeps happening, check that TideTrack is running and your internet connection is stable.`,
      recommendations: [],
      encouragement: "Don't worry — your study data is safe. This is just a temporary hiccup.",
      suggested_followups: [
        'Try asking me again',
        'Review my session data manually'
      ]
    };
  },

  /**
   * Persist lightweight conversation memory for cross-session continuity
   */
  async _persistMemory(userMessage, response) {
    try {
      const result = await chrome.storage.local.get(['_agentMemory']);
      const memory = result._agentMemory || {
        interactions: 0,
        firstInteraction: new Date().toISOString(),
        lastInteraction: null,
        studentName: null,
        knownGoals: [],
        previousRecommendations: [],
        focusTrend: [],
      };

      memory.interactions += 1;
      memory.lastInteraction = new Date().toISOString();

      // Track focus trend over time
      if (response.intent === 'SESSION_REVIEW' || response.intent === 'WEEKLY_REVIEW') {
        const ctx = await AgentTools.gatherContext();
        if (ctx.weekly?.weekFocusPercentage) {
          memory.focusTrend.push({
            date: new Date().toISOString().split('T')[0],
            focusPct: ctx.weekly.weekFocusPercentage
          });
          // Keep last 12 entries
          if (memory.focusTrend.length > 12) {
            memory.focusTrend = memory.focusTrend.slice(-12);
          }
        }
      }

      // Store latest recommendations (for follow-up tracking)
      if (response.recommendations?.length > 0) {
        memory.previousRecommendations = response.recommendations.slice(0, 3);
      }

      await chrome.storage.local.set({ _agentMemory: memory });
    } catch (err) {
      console.warn('Failed to persist agent memory:', err);
    }
  },

  /**
   * Clear conversation history (new session)
   */
  resetConversation() {
    this.conversationHistory = [];
  },

  /**
   * Clear all agent memory (full reset)
   */
  async resetMemory() {
    this.conversationHistory = [];
    await chrome.storage.local.remove('_agentMemory');
  }
};
