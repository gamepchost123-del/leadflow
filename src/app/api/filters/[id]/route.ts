import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    await prisma.filterRule.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Failed to delete filter rule:', error);
    return NextResponse.json(
      { error: 'Failed to delete filter rule' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { isActive } = body;

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive must be a boolean' },
        { status: 400 }
      );
    }

    const rule = await prisma.filterRule.update({
      where: { id },
      data: { isActive },
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Failed to update filter rule:', error);
    return NextResponse.json(
      { error: 'Failed to update filter rule' },
      { status: 500 }
    );
  }
}
