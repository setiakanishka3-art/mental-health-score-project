from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal
from fastapi.middleware.cors import CORSMiddleware

PROJECT_DIR = Path(__file__).resolve().parent
model = joblib.load(PROJECT_DIR / 'Mental_Health_Model.pkl')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


#A first Pydantic Model
class StudentData(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

    age                     : int = Field(..., ge=10, le=100)
    gender                  : Literal['Male', 'Female']
    country                 : str
    academic_level          : Literal['Undergraduate', 'Graduate', 'High School']
    most_used_platform      : Literal['Facebook', 'LinkedIn', 'Instagram', 'Snapchat','Twitter','YouTube', 'TikTok', 'LINE', 'KakaoTalk', 'VKontakte', 'WhatsApp','WeChat']
    purpose_of_use          : Literal['Networking', 'Education', 'Entertainment', 'News']
    avg_daily_usage_hours   : float = Field(..., ge=0, le=24)
    daily_unlocks           : int   = Field(..., ge=0, le=273)
    study_hours             : float = Field(..., ge=0, le=24)
    physical_activity_hours : float = Field(..., ge=0, le=24)
    sleep_hours_per_night   : float = Field(..., ge=0, le=24)
    stress_level            : Literal['Medium', 'Low', 'Very High', 'High']

    @field_validator('country')
    @classmethod
    def normalize_country(cls, value: str) -> str:
        country = value.strip()
        if not country:
            raise ValueError('Country must not be empty.')
        if len(country) > 80:
            raise ValueError('Country must be 80 characters or fewer.')
        return country




# Describe what we send back
class PredictionResponse(BaseModel):
    predicted_mental_health_score:float
    #6.777777 -> float




@app.get('/', response_class=FileResponse, include_in_schema=False)
def serve_frontend():
    return FileResponse(PROJECT_DIR / 'index.html')


@app.get('/script.js', include_in_schema=False)
def serve_script():
    return FileResponse(PROJECT_DIR / 'script.js', media_type='application/javascript')


@app.get('/style.css', include_in_schema=False)
def serve_styles():
    return FileResponse(PROJECT_DIR / 'style.css', media_type='text/css')


@app.get('/healthz', include_in_schema=False)
def health_check():
    return {'status': 'ok'}


@app.get('/model-comparison')
def model_comparison():
    metrics_path = PROJECT_DIR / 'model_comparison.csv'
    if not metrics_path.exists():
        return {'models': []}
    return {'models': pd.read_csv(metrics_path).to_dict(orient='records')}


@app.post('/predict', response_model=PredictionResponse) #6.77777
def predict(data: StudentData):
    input_row = pd.DataFrame([{
        'Age'                       :data.age,
        'Gender'                    :data.gender,
        'Country'                   :data.country,
        'Academic_Level'            :data.academic_level,
        'Most_Used_Platform'        :data.most_used_platform,
        'Purpose_Of_Use'            :data.purpose_of_use,
        'Avg_Daily_Usage_Hours'     :data.avg_daily_usage_hours,
        'Daily_Unlocks'             :data.daily_unlocks,
        'Study_Hours'               :data.study_hours,
        'Physical_Activity_Hours'   :data.physical_activity_hours,
        'Sleep_Hours_Per_Night'     :data.sleep_hours_per_night,
        'Stress_Level'              :data.stress_level,
   }])

    prediction = model.predict(input_row)[0]
    return PredictionResponse(predicted_mental_health_score=round(float(prediction), 2))