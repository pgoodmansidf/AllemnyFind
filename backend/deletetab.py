from app.core.database import engine
from app.models.machinery import Machinery

# Drop the existing table
Machinery.__table__.drop(engine)

# Create the table with new columns
Machinery.__table__.create(engine)

print("Table recreated with new columns")