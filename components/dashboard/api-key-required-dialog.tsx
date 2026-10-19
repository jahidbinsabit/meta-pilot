'use client';

import * as React from 'react';
import { Key } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserApiKeysModal } from '@/components/dashboard/user-api-keys-dialog';

/**
 * Shown when the user tries to generate without an API key while BYOK is required.
 * "Add API Key" opens the API key modal directly.
 */
export function ApiKeyRequiredDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [keysOpen, setKeysOpen] = React.useState(false);

  const handleAdd = () => {
    onOpenChange(false);
    setKeysOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
                <Key className="h-5 w-5 text-accent" />
              </div>
              <div>
                <DialogTitle>Please Add Your API Key</DialogTitle>
                <DialogDescription className="mt-1">
                  Generation requires your own AI API key. Add one to continue.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>
              <Key className="mr-2 h-4 w-4" /> Add API Key
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <UserApiKeysModal open={keysOpen} onOpenChange={setKeysOpen} />
    </>
  );
}
