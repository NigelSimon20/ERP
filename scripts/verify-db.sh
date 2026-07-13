#!/bin/bash

# Database Migration Setup Script for Raven Shield ERP

echo "🚀 Starting Raven Shield Database Migration Setup"
echo "=================================================="

# Check environment
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

echo "✅ Environment file found"

# Extract DATABASE_URL
DB_URL=$(grep "DATABASE_URL" .env | cut -d'"' -f2)

if [ -z "$DB_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env"
    exit 1
fi

echo "✅ Database URL configured"

# Test connection
echo ""
echo "Testing database connection..."
npx prisma db push --skip-generate 2>&1 | head -20

if [ $? -eq 0 ]; then
    echo "✅ Database connection successful"
else
    echo "⚠️  Database connection failed - checking Supabase status"
    echo ""
    echo "Please ensure:"
    echo "1. Supabase project is running"
    echo "2. Database URL is correct"
    echo "3. Network connectivity to Supabase is working"
    exit 1
fi

echo ""
echo "✅ Setup verification complete"
