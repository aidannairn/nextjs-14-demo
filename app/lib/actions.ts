'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql } from '@vercel/postgres'
import { z } from 'zod'

import { signIn } from '@/auth'

const InvoiceSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
})

export type State = {
  errors?: {
    customerId?: string[]
    amount?: string[]
    status?: string[]
  }
  message?: string | null
}

const CreateInvoice = InvoiceSchema.omit({ id: true, date: true })

/*
  "prevState" contains the state passed from the useFormState hook. We won't be using it in the action in below, but it is a required prop.
*/
export async function createInvoice(prevState: State, formData: FormData) {
  const rawFormData = {
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  } // Can be refactored to the following line

  // const rawFormData = Object.fromEntries(formData.entries())

  // Validate form fields using Zod
  const validatedFields = CreateInvoice.safeParse(rawFormData)

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    }
  }

  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data

  /*
    It's usually good practice to store monetary values in cents in your database to eliminate JavaScript floating-point errors and ensure greater accuracy.
  */
  const amountInCents = amount * 100

  const date = new Date().toISOString().split('T')[0]

  // Insert data into the database
  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `
  } catch (error) {
    // If a database error occurs, return a more specific error
    return {
      message: 'Database Error: Failed to Create Invoice.',
    }
  }

  // Revalidate the cache for the invoices page
  revalidatePath('/dashboard/invoices')
  /* 
    redirect() works by throwing an error, which would be caught by the catch block. To avoid this, you can call redirect after try/catch.
  */
  redirect('/dashboard/invoices')
}

const UpdateInvoice = InvoiceSchema.omit({ date: true, id: true })
export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    }
  }

  const { customerId, amount, status } = validatedFields.data
  const amountInCents = amount * 100

  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `
  } catch (error) {
    return { message: 'Database Error: Failed to Update Invoice.' }
  }

  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`
    revalidatePath('/dashboard/invoices')
    return { message: 'Deleted Invoice.' }
  } catch (error) {
    return { message: 'Database Error: Failed to Delete Invoice.' }
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', Object.fromEntries(formData));
  } catch (error) {
    if ((error as Error).message.includes('CredentialsSignin')) {
      return 'CredentialSignin';
    }
    throw error;
  }
}