from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import httpx
import os
from datetime import datetime, timezone
from collections import defaultdict
import math

app = FastAPI(title="XScore API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN")

HEADERS = {"Authorization": f"Bearer {BEARER_TOKEN}"}
BASE_URL = "https://api.twitter.com/2"


async def get_user_by_username(username: str) -> dict:
    url = f"{BASE_URL}/users/by/username/{username}"
    params = {
        "user.fields": "public_metrics,profile_image_url,description,verified,created_at,location,url"
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=HEADERS, params=params)
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail="User not found")
        if r.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid bearer token")
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail="Twitter API error")
        data = r.json()
        if "errors" in data:
            raise HTTPException(status_code=404, detail="User not found")
        return data["data"]


async def get_user_tweets(user_id: str, max_results: int = 100) -> list:
    url = f"{BASE_URL}/users/{user_id}/tweets"
    params = {
        "max_results": min(max_results, 100),
        "tweet.fields": "created_at,public_metrics,text,entities",
        "exclude": "retweets,replies",
    }
    tweets = []
    async with httpx.AsyncClient() as client:
        while len(tweets) < max_results:
            r = await client.get(url, headers=HEADERS, params=params)
            if r.status_code != 200:
                break
            data = r.json()
            batch = data.get("data", [])
            if not batch:
                break
            tweets.extend(batch)
            next_token = data.get("meta", {}).get("next_token")
            if not next_token or len(tweets) >= max_results:
                break
            params["pagination_token"] = next_token
    return tweets[:max_results]


def compute_engagement(tweet: dict) -> int:
    m = tweet.get("public_metrics", {})
    return (
        m.get("like_count", 0)
        + m.get("retweet_count", 0)
        + m.get("reply_count", 0)
        + m.get("quote_count", 0)
    )


def compute_social_score(tweets: list, user_metrics: dict) -> float:
    if not tweets:
        return 0.0

    engagements = [compute_engagement(t) for t in tweets]
    avg_eng = sum(engagements) / len(engagements)
    banger_count = sum(1 for e in engagements if e >= 1000)
    banger_rate = banger_count / len(tweets)
    followers = user_metrics.get("followers_count", 1)

    # Normalize avg engagement vs follower count (engagement rate)
    eng_rate = avg_eng / max(followers, 1) * 100

    # Posting consistency (tweets per week estimate)
    consistency_score = min(len(tweets) / 50, 1.0) * 100

    # Viral bonus
    viral_bonus = banger_rate * 200

    # Follower weight (log scale)
    follower_score = math.log10(max(followers, 10)) * 10

    score = (
        eng_rate * 30
        + consistency_score * 20
        + viral_bonus * 30
        + follower_score * 20
    )
    return round(min(score, 1000), 1)


def compute_grade(score: float) -> str:
    if score >= 800:
        return "S"
    elif score >= 600:
        return "A"
    elif score >= 400:
        return "B"
    elif score >= 200:
        return "C"
    else:
        return "D"


def get_posting_hours(tweets: list) -> list:
    hour_eng = defaultdict(list)
    for t in tweets:
        created = t.get("created_at", "")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                hour_eng[dt.hour].append(compute_engagement(t))
            except Exception:
                pass
    result = []
    for h in range(24):
        vals = hour_eng.get(h, [0])
        result.append({"hour": h, "avg_engagement": round(sum(vals) / len(vals), 1)})
    return result


def get_insights(tweets: list, banger_rate: float, avg_eng: float) -> list:
    insights = []
    if not tweets:
        return insights

    if banger_rate > 0.3:
        insights.append({"type": "positive", "text": "Strong viral content — over 30% of your posts hit 1k+ engagement."})
    elif banger_rate > 0.1:
        insights.append({"type": "neutral", "text": "Decent banger rate. Focus on what makes your top posts work."})
    else:
        insights.append({"type": "warning", "text": "Low banger rate. Experiment with hooks, threads, and visuals."})

    lengths = [len(t.get("text", "")) for t in tweets]
    avg_len = sum(lengths) / len(lengths)
    if avg_len > 250:
        insights.append({"type": "warning", "text": "Your tweets tend to be long. Shorter posts often perform better."})
    elif avg_len < 80:
        insights.append({"type": "neutral", "text": "Concise posting style. Consider adding more context to some posts."})
    else:
        insights.append({"type": "positive", "text": "Good tweet length — sweet spot for engagement."})

    if len(tweets) < 20:
        insights.append({"type": "warning", "text": "Post more consistently. Activity builds algorithmic reach."})
    elif len(tweets) >= 60:
        insights.append({"type": "positive", "text": "Highly active account. Consistency is your edge."})

    return insights


@app.get("/")
def root():
    return {"status": "XScore API is running", "version": "1.0.0"}


@app.get("/analyze/{username}")
async def analyze(username: str):
    if not BEARER_TOKEN:
        raise HTTPException(status_code=500, detail="TWITTER_BEARER_TOKEN not set")

    user = await get_user_by_username(username.lstrip("@"))
    user_id = user["id"]
    user_metrics = user.get("public_metrics", {})

    tweets = await get_user_tweets(user_id, max_results=100)

    if not tweets:
        return {
            "username": user.get("username"),
            "name": user.get("name"),
            "profile_image_url": user.get("profile_image_url"),
            "description": user.get("description", ""),
            "followers": user_metrics.get("followers_count", 0),
            "following": user_metrics.get("following_count", 0),
            "tweet_count": user_metrics.get("tweet_count", 0),
            "total_analyzed": 0,
            "bangers": 0,
            "banger_rate": 0.0,
            "avg_engagement": 0.0,
            "social_score": 0.0,
            "grade": "D",
            "top_posts": [],
            "posting_hours": [],
            "insights": [],
        }

    engagements = [compute_engagement(t) for t in tweets]
    avg_eng = sum(engagements) / len(engagements)
    bangers = [t for t, e in zip(tweets, engagements) if e >= 1000]
    banger_rate = len(bangers) / len(tweets)

    top_posts = sorted(tweets, key=lambda t: compute_engagement(t), reverse=True)[:5]
    top_posts_out = []
    for t in top_posts:
        m = t.get("public_metrics", {})
        top_posts_out.append({
            "id": t["id"],
            "text": t["text"],
            "created_at": t.get("created_at", ""),
            "likes": m.get("like_count", 0),
            "retweets": m.get("retweet_count", 0),
            "replies": m.get("reply_count", 0),
            "quotes": m.get("quote_count", 0),
            "engagement": compute_engagement(t),
            "url": f"https://twitter.com/{user.get('username')}/status/{t['id']}",
        })

    score = compute_social_score(tweets, user_metrics)
    grade = compute_grade(score)
    insights = get_insights(tweets, banger_rate, avg_eng)
    posting_hours = get_posting_hours(tweets)

    return {
        "username": user.get("username"),
        "name": user.get("name"),
        "profile_image_url": user.get("profile_image_url"),
        "description": user.get("description", ""),
        "followers": user_metrics.get("followers_count", 0),
        "following": user_metrics.get("following_count", 0),
        "tweet_count": user_metrics.get("tweet_count", 0),
        "total_analyzed": len(tweets),
        "bangers": len(bangers),
        "banger_rate": round(banger_rate, 4),
        "avg_engagement": round(avg_eng, 1),
        "social_score": score,
        "grade": grade,
        "top_posts": top_posts_out,
        "posting_hours": posting_hours,
        "insights": insights,
    }


@app.get("/health")
def health():
    return {"status": "ok"}
