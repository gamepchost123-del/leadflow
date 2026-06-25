import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rules = await prisma.filterRule.findMany({
      orderBy: { value: 'asc' },
    });
    return NextResponse.json(rules);
  } catch (error) {
    console.error('Failed to fetch filter rules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch filter rules' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, category, value, isActive = true } = body;

    if (!type || !category || !value) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const rule = await prisma.filterRule.create({
      data: {
        type,
        category,
        value: value.trim(),
        isActive,
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create filter rule:', error);
    
    // Check for unique constraint violation (Prisma P2002)
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'This rule already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create filter rule' },
      { status: 500 }
    );
  }
}
